"""Tests for background services: status_watcher, metrics_parser, gpu_poller, hang detection."""

import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

# Ensure test env vars are set before importing server modules
os.environ.setdefault("VRS_DB_PATH", ":memory:")
os.environ.setdefault("VRS_SCENES_DIR", "test_scenes")

from server.models.pipeline import StatusFile
from server.models.ws import TrainingMetric
from server.services.metrics_parser import (
    _check_anomalies,
    _parse_line,
    parse_metrics_file,
)
from server.services.status_watcher import read_status_file


@pytest.fixture(autouse=True)
def _setup_test_scenes(tmp_path: Path) -> None:  # noqa: PT004
    """Create and clean up a test scenes directory."""
    # Point settings to tmp_path
    from server.config import settings
    settings.scenes_dir = str(tmp_path)


# --- status_watcher tests ---


class TestReadStatusFile:
    def test_returns_none_for_missing_file(self, tmp_path: Path) -> None:
        result = read_status_file("nonexistent_scene")
        assert result is None

    def test_parses_valid_status_file(self, tmp_path: Path) -> None:
        scene_dir = tmp_path / "test_scene"
        scene_dir.mkdir()
        status_data = {
            "scene_id": "test_scene",
            "current_step": 3,
            "step_name": "colmap_matching",
            "status": "running",
            "message": "Processing...",
            "timestamp": "2026-01-01T00:00:00Z",
            "pid": 12345,
        }
        (scene_dir / "status.json").write_text(
            json.dumps(status_data), encoding="utf-8"
        )
        result = read_status_file("test_scene")
        assert result is not None
        assert isinstance(result, StatusFile)
        assert result.current_step == 3
        assert result.status == "running"

    def test_returns_none_for_invalid_json(self, tmp_path: Path) -> None:
        scene_dir = tmp_path / "bad_scene"
        scene_dir.mkdir()
        (scene_dir / "status.json").write_text("{invalid json", encoding="utf-8")
        result = read_status_file("bad_scene")
        assert result is None


# --- metrics_parser tests ---


class TestParseLine:
    def test_parses_valid_line(self) -> None:
        line = "1000\t30000\t0.0234\t25.5\t500000\t120.5\t3600.0"
        result = _parse_line(line)
        assert result is not None
        assert isinstance(result, TrainingMetric)
        assert result.iteration == 1000
        assert result.max_iterations == 30000
        assert result.loss == pytest.approx(0.0234)
        assert result.psnr == pytest.approx(25.5)
        assert result.gaussian_count == 500000

    def test_returns_none_for_invalid_line(self) -> None:
        assert _parse_line("not enough fields") is None
        assert _parse_line("a\tb\tc\td\te\tf\tg") is None
        assert _parse_line("") is None

    def test_returns_none_for_wrong_field_count(self) -> None:
        assert _parse_line("1\t2\t3\t4\t5\t6") is None  # 6 fields
        assert _parse_line("1\t2\t3\t4\t5\t6\t7\t8") is None  # 8 fields


class TestParseMetricsFile:
    def test_returns_empty_for_missing_file(self, tmp_path: Path) -> None:
        result = parse_metrics_file("nonexistent")
        assert result == []

    def test_parses_valid_file(self, tmp_path: Path) -> None:
        scene_dir = tmp_path / "metrics_scene"
        scene_dir.mkdir()
        lines = [
            "100\t30000\t0.05\t20.0\t100000\t10.0\t3000.0",
            "200\t30000\t0.04\t21.0\t150000\t20.0\t2900.0",
        ]
        (scene_dir / "training_metrics.log").write_text(
            "\n".join(lines), encoding="utf-8"
        )
        result = parse_metrics_file("metrics_scene")
        assert len(result) == 2
        assert result[0].iteration == 100
        assert result[1].iteration == 200


class TestAnomalyDetection:
    @pytest.mark.asyncio
    async def test_nan_loss_warning(self) -> None:
        metric = TrainingMetric(
            iteration=1000, max_iterations=30000,
            loss=float("nan"), psnr=20.0,
            gaussian_count=100000, elapsed_seconds=100.0, eta_seconds=2900.0,
        )
        with patch("server.services.metrics_parser.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            await _check_anomalies("test", metric, [], "1000\t30000\tnan\t20.0\t100000\t100.0\t2900.0")
            mock_mgr.broadcast.assert_called_once()
            call_data = mock_mgr.broadcast.call_args[0][1]
            assert call_data["type"] == "warning"
            assert "NaN" in call_data["data"]["message"]

    @pytest.mark.asyncio
    async def test_cuda_oom_warning(self) -> None:
        metric = TrainingMetric(
            iteration=5000, max_iterations=30000,
            loss=0.03, psnr=22.0,
            gaussian_count=200000, elapsed_seconds=500.0, eta_seconds=2500.0,
        )
        with patch("server.services.metrics_parser.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            await _check_anomalies(
                "test", metric, [],
                "CUDA out of memory. Tried to allocate 2.00 GiB",
            )
            mock_mgr.broadcast.assert_called_once()
            call_data = mock_mgr.broadcast.call_args[0][1]
            assert call_data["type"] == "warning"
            assert "CUDA out of memory" in call_data["data"]["message"]

    @pytest.mark.asyncio
    async def test_loss_spike_warning(self) -> None:
        # Build a history with stable loss, then a spike
        recent = [
            TrainingMetric(
                iteration=i, max_iterations=30000,
                loss=0.03, psnr=22.0,
                gaussian_count=200000, elapsed_seconds=float(i),
                eta_seconds=30000.0 - i,
            )
            for i in range(0, 1001, 100)
        ]
        # Current metric with >50% loss increase
        spike = TrainingMetric(
            iteration=1500, max_iterations=30000,
            loss=0.06, psnr=22.0,  # 100% increase from 0.03
            gaussian_count=200000, elapsed_seconds=1500.0, eta_seconds=28500.0,
        )
        with patch("server.services.metrics_parser.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            await _check_anomalies("test", spike, recent, "1500\t30000\t0.06\t22.0\t200000\t1500.0\t28500.0")
            mock_mgr.broadcast.assert_called_once()
            call_data = mock_mgr.broadcast.call_args[0][1]
            assert call_data["type"] == "warning"
            assert "spike" in call_data["data"]["message"].lower()


# --- gpu_poller tests ---


class TestGpuPoller:
    @pytest.mark.asyncio
    async def test_query_gpu_stats_nvidia_not_found(self) -> None:
        from server.services.gpu_poller import _query_gpu_stats
        with patch("server.services.gpu_poller.asyncio.create_subprocess_exec", side_effect=FileNotFoundError):
            result = await _query_gpu_stats()
            assert result is None

    @pytest.mark.asyncio
    async def test_query_gpu_stats_parses_output(self) -> None:
        from server.services.gpu_poller import _query_gpu_stats

        mock_process = AsyncMock()
        mock_process.communicate = AsyncMock(
            return_value=(b"4096, 8192, 75\n", b"")
        )
        mock_process.returncode = 0

        with patch(
            "server.services.gpu_poller.asyncio.create_subprocess_exec",
            return_value=mock_process,
        ):
            result = await _query_gpu_stats()
            assert result is not None
            assert result["memory_used_mb"] == 4096.0
            assert result["memory_total_mb"] == 8192.0
            assert result["utilization_pct"] == 75.0


# --- hang detection tests ---


class TestHangDetection:
    def test_hang_thresholds_cover_all_steps(self) -> None:
        from server.services.pipeline_service import HANG_THRESHOLDS, PIPELINE_STEPS
        # Step 0 (preflight) + all pipeline steps
        for step_num, _ in PIPELINE_STEPS:
            assert step_num in HANG_THRESHOLDS, f"Missing threshold for step {step_num}"
        assert 0 in HANG_THRESHOLDS, "Missing threshold for preflight step 0"

    def test_warn_less_than_kill(self) -> None:
        from server.services.pipeline_service import HANG_THRESHOLDS
        for step, (warn, kill) in HANG_THRESHOLDS.items():
            assert warn < kill, f"Step {step}: warn ({warn}) >= kill ({kill})"

    def test_update_step_tracking(self) -> None:
        from server.services.pipeline_service import _step_tracking, update_step_tracking
        update_step_tracking("test_scene", 3)
        assert "test_scene" in _step_tracking
        _, step = _step_tracking["test_scene"]
        assert step == 3
        # Cleanup
        _step_tracking.pop("test_scene", None)
