"""Step 7: Validation -- verify SfM quality before training."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

from server.models import PipelineConfig, StepResult, ValidationReport
from server.pipeline.steps.base import StepBase


class ValidationStep(StepBase):
    """Check registration rate, reprojection error, and coverage."""

    step_num: int = 7
    step_name: str = "validation"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Compute and report SfM validation metrics."""
        scene_dir = self.get_scene_dir(scene_id)
        aligned_dir = scene_dir / "aligned"

        if not aligned_dir.exists() or not any(aligned_dir.iterdir()):
            return StepResult(
                exit_code=2,
                message="No aligned model found — run alignment first",
                duration_seconds=self.elapsed_time,
            )

        # Run model_analyzer
        report = await self._analyze_model(scene_id, aligned_dir)

        # Determine alignment status
        alignment_info_path = scene_dir / "alignment_method.json"
        if alignment_info_path.exists():
            import json

            info = json.loads(alignment_info_path.read_text(encoding="utf-8"))
            report.alignment_status = info.get("method", "unknown")
        else:
            report.alignment_status = "unknown"

        # Write validation report
        report_path = scene_dir / "validation_report.json"
        report_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")

        await self.write_log(scene_id, f"Registration rate: {report.registration_rate:.1f}%")
        await self.write_log(scene_id, f"Reprojection error: {report.reprojection_error:.4f}")
        await self.write_log(scene_id, f"Point count: {report.point_count}")
        await self.write_log(scene_id, f"Camera model: {report.camera_model}")
        await self.write_log(scene_id, f"Image count: {report.image_count}")
        await self.write_log(scene_id, f"Alignment: {report.alignment_status}")

        # Push report via WebSocket
        await self.push_websocket(scene_id, {
            "type": "validation",
            "data": report.model_dump(),
        })

        # Return exit_code=0 — the orchestrator handles the AWAITING_CONFIRMATION pause
        return StepResult(
            exit_code=0,
            message=f"Validation complete: {report.registration_rate:.1f}% registered, "
            f"{report.point_count} points, reproj error {report.reprojection_error:.4f}",
            duration_seconds=self.elapsed_time,
        )

    async def _analyze_model(self, scene_id: str, model_dir: Path) -> ValidationReport:
        """Run colmap model_analyzer and parse output into a ValidationReport."""
        report = ValidationReport()

        cmd = [
            "colmap", "model_analyzer",
            "--path", str(model_dir),
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, _ = await proc.communicate()
        output = stdout_bytes.decode("utf-8", errors="replace")

        await self.write_log(scene_id, "--- model_analyzer output ---")
        for line in output.splitlines():
            await self.write_log(scene_id, line)

        # Parse registered images
        match = re.search(r"Registered images\s*[:=]\s*(\d+)", output)
        if match:
            report.image_count = int(match.group(1))

        # Parse points
        match = re.search(r"Points\s*[:=]\s*(\d+)", output)
        if match:
            report.point_count = int(match.group(1))

        # Parse mean reprojection error
        match = re.search(r"Mean reprojection error\s*[:=]\s*([\d.]+)", output)
        if match:
            report.reprojection_error = float(match.group(1))

        # Calculate registration rate
        frames_dir = self.get_scene_dir(scene_id) / "frames"
        total_frames = len(list(frames_dir.glob("frame_*.jpg")))
        if total_frames > 0 and report.image_count > 0:
            report.registration_rate = (report.image_count / total_frames) * 100.0

        # Camera model
        report.camera_model = "SIMPLE_RADIAL"  # from config, can be read from cameras.bin

        return report
