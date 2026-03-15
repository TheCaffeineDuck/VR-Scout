"""Training metrics log parser.

Parses training_metrics.log produced during gsplat training.
Live tailing during training pushes TrainingMetric messages via WebSocket.
Detects anomalies: loss spikes, NaN loss, stalls, PSNR plateaus, CUDA OOM.
"""

import asyncio
import logging
import math
import time
from pathlib import Path
from typing import Optional

from ..config import settings
from ..models.ws import TrainingMetric
from ..ws.manager import manager

logger = logging.getLogger(__name__)

# Track active tailing tasks by scene_id
_tailer_tasks: dict[str, asyncio.Task[None]] = {}

TAIL_INTERVAL_SECONDS = 0.5

# Anomaly detection thresholds
LOSS_SPIKE_WINDOW = 500  # iterations
LOSS_SPIKE_THRESHOLD = 0.50  # 50% increase
STALL_TIMEOUT_SECONDS = 300  # 5 minutes
PSNR_PLATEAU_WINDOW = 5000  # iterations


def parse_metrics_file(scene_id: str) -> list[TrainingMetric]:
    """Parse all training metrics from the log file.

    Returns an empty list if the file does not exist.
    """
    metrics_path = Path(settings.scenes_dir) / scene_id / "training_metrics.log"
    if not metrics_path.exists():
        return []

    metrics: list[TrainingMetric] = []
    for line in metrics_path.read_text(encoding="utf-8").strip().splitlines():
        parsed = _parse_line(line)
        if parsed is not None:
            metrics.append(parsed)
    return metrics


def _parse_line(line: str) -> Optional[TrainingMetric]:
    """Parse a single metrics log line.

    Expected format (tab-separated):
    iteration\tmax_iterations\tloss\tpsnr\tgaussian_count\telapsed_seconds\teta_seconds
    """
    parts = line.strip().split("\t")
    if len(parts) != 7:
        return None
    try:
        return TrainingMetric(
            iteration=int(parts[0]),
            max_iterations=int(parts[1]),
            loss=float(parts[2]),
            psnr=float(parts[3]),
            gaussian_count=int(parts[4]),
            elapsed_seconds=float(parts[5]),
            eta_seconds=float(parts[6]),
        )
    except (ValueError, IndexError):
        return None


async def _check_anomalies(
    scene_id: str,
    metric: TrainingMetric,
    recent_metrics: list[TrainingMetric],
    raw_line: str,
) -> None:
    """Check for training anomalies and broadcast warnings."""

    # NaN loss
    if math.isnan(metric.loss) or "nan" in raw_line.lower():
        await manager.broadcast(scene_id, {
            "type": "warning",
            "data": {"message": f"NaN loss detected at iteration {metric.iteration}"},
        })
        return

    # CUDA OOM
    if "cuda out of memory" in raw_line.lower():
        await manager.broadcast(scene_id, {
            "type": "warning",
            "data": {"message": f"CUDA out of memory at iteration {metric.iteration}"},
        })
        return

    # Loss spike: loss increases >50% over last LOSS_SPIKE_WINDOW iterations
    if len(recent_metrics) >= 2:
        window_start_iter = metric.iteration - LOSS_SPIKE_WINDOW
        baseline_metrics = [
            m for m in recent_metrics if m.iteration <= window_start_iter
        ]
        if baseline_metrics:
            baseline_loss = baseline_metrics[-1].loss
            if baseline_loss > 0 and not math.isnan(baseline_loss):
                increase = (metric.loss - baseline_loss) / baseline_loss
                if increase > LOSS_SPIKE_THRESHOLD:
                    await manager.broadcast(scene_id, {
                        "type": "warning",
                        "data": {
                            "message": (
                                f"Loss spike detected at iteration {metric.iteration}: "
                                f"{baseline_loss:.4f} -> {metric.loss:.4f} "
                                f"({increase:.0%} increase over {LOSS_SPIKE_WINDOW} iterations)"
                            ),
                        },
                    })

    # PSNR plateau: no increase for >PSNR_PLATEAU_WINDOW iterations
    if len(recent_metrics) >= 2:
        plateau_start_iter = metric.iteration - PSNR_PLATEAU_WINDOW
        older_metrics = [
            m for m in recent_metrics if m.iteration <= plateau_start_iter
        ]
        if older_metrics:
            max_old_psnr = max(m.psnr for m in older_metrics)
            if metric.psnr <= max_old_psnr and metric.iteration > PSNR_PLATEAU_WINDOW:
                await manager.broadcast(scene_id, {
                    "type": "warning",
                    "data": {
                        "message": (
                            f"PSNR plateau: no improvement for {PSNR_PLATEAU_WINDOW} "
                            f"iterations (current: {metric.psnr:.2f}, "
                            f"best: {max_old_psnr:.2f})"
                        ),
                    },
                })


async def _tail_loop(scene_id: str) -> None:
    """Background task that tails training_metrics.log and broadcasts metrics."""
    logger.info("Metrics tailer started for scene %s", scene_id)
    metrics_path = Path(settings.scenes_dir) / scene_id / "training_metrics.log"
    lines_read = 0
    recent_metrics: list[TrainingMetric] = []
    last_line_time = time.monotonic()

    try:
        while True:
            await asyncio.sleep(TAIL_INTERVAL_SECONDS)

            if not metrics_path.exists():
                # Check for stall only if we already started reading
                if lines_read > 0:
                    elapsed = time.monotonic() - last_line_time
                    if elapsed > STALL_TIMEOUT_SECONDS:
                        await manager.broadcast(scene_id, {
                            "type": "warning",
                            "data": {
                                "message": (
                                    f"Training stall: no new metrics for "
                                    f"{elapsed:.0f} seconds"
                                ),
                            },
                        })
                        last_line_time = time.monotonic()  # Reset to avoid spam
                continue

            try:
                all_lines = metrics_path.read_text(encoding="utf-8").strip().splitlines()
            except OSError:
                continue

            if len(all_lines) <= lines_read:
                # No new lines — check for stall
                if lines_read > 0:
                    elapsed = time.monotonic() - last_line_time
                    if elapsed > STALL_TIMEOUT_SECONDS:
                        await manager.broadcast(scene_id, {
                            "type": "warning",
                            "data": {
                                "message": (
                                    f"Training stall: no new metrics for "
                                    f"{elapsed:.0f} seconds"
                                ),
                            },
                        })
                        last_line_time = time.monotonic()
                continue

            # Process new lines
            new_lines = all_lines[lines_read:]
            lines_read = len(all_lines)
            last_line_time = time.monotonic()

            for raw_line in new_lines:
                metric = _parse_line(raw_line)
                if metric is None:
                    continue

                recent_metrics.append(metric)

                # Broadcast metric
                await manager.broadcast(scene_id, {
                    "type": "metric",
                    "data": metric.model_dump(),
                })

                # Check anomalies
                await _check_anomalies(scene_id, metric, recent_metrics, raw_line)

    except asyncio.CancelledError:
        logger.info("Metrics tailer stopped for scene %s", scene_id)


def start_tailing(scene_id: str) -> None:
    """Start tailing training_metrics.log for a scene. Idempotent."""
    if scene_id in _tailer_tasks:
        task = _tailer_tasks[scene_id]
        if not task.done():
            return

    _tailer_tasks[scene_id] = asyncio.create_task(_tail_loop(scene_id))


def stop_tailing(scene_id: str) -> None:
    """Stop tailing training_metrics.log for a scene. Idempotent."""
    task = _tailer_tasks.pop(scene_id, None)
    if task is not None and not task.done():
        task.cancel()


def is_tailing(scene_id: str) -> bool:
    """Check if a tailer is active for a scene."""
    task = _tailer_tasks.get(scene_id)
    return task is not None and not task.done()
