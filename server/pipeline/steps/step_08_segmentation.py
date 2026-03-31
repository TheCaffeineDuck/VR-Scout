"""Step 8: Segmentation -- generate per-frame sky and transient masks."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from server.config import settings
from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class SegmentationStep(StepBase):
    """Produce binary masks for sky, people, and transient objects."""

    step_num: int = 8
    step_name: str = "segmentation"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run segmentation to generate training masks."""
        if config.segmentation == "off":
            return StepResult(
                exit_code=0,
                message="Skipped: segmentation disabled in config.",
                duration_seconds=self.elapsed_time,
            )

        # Check hardware profile
        profile = settings.load_hardware_profile()
        if profile and profile.profile.value == "constrained":
            return StepResult(
                exit_code=0,
                message="Skipped: constrained hardware profile.",
                duration_seconds=self.elapsed_time,
            )

        scene_dir = self.get_scene_dir(scene_id)
        frames_dir = scene_dir / "frames"
        depth_dir = scene_dir / "depth"
        masks_dir = scene_dir / "masks"
        masks_dir.mkdir(parents=True, exist_ok=True)

        frame_files = sorted(frames_dir.glob("frame_*.*"))
        if not frame_files:
            frame_files = sorted(
                f for f in frames_dir.iterdir()
                if f.suffix.lower() in (".jpg", ".jpeg", ".png")
            )

        if not frame_files:
            return StepResult(
                exit_code=2,
                message="No frames found for segmentation.",
                duration_seconds=self.elapsed_time,
            )

        total = len(frame_files)

        # Check if depth maps available for depth-based approach
        has_depth = depth_dir.exists() and any(depth_dir.glob("*.png"))

        if config.segmentation == "auto" and not has_depth:
            return StepResult(
                exit_code=1,
                message=(
                    "Skipped: auto mode requires depth maps. "
                    "Enable depth estimation or set segmentation to 'on'."
                ),
                duration_seconds=self.elapsed_time,
            )

        method = "depth" if has_depth else "threshold"
        await self.write_log(scene_id, f"Running segmentation ({method}) on {total} frames")

        # Run helper script
        script_path = Path(settings.project_root) / "scripts" / "run_segmentation.py"
        cmd: list[str] = [
            sys.executable, str(script_path),
            "--frames_dir", str(frames_dir),
            "--output_dir", str(masks_dir),
            "--method", method,
        ]
        if has_depth:
            cmd.extend(["--depth_dir", str(depth_dir)])

        result = await self._run_with_progress(scene_id, cmd)
        if result.exit_code != 0:
            return result

        mask_count = len(list(masks_dir.glob("*.png")))
        if mask_count == 0:
            return StepResult(
                exit_code=1,
                message="Segmentation produced no masks. Training will proceed without masks.",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(
            exit_code=0,
            message=f"Segmentation complete: {mask_count} masks generated.",
            duration_seconds=self.elapsed_time,
        )

    async def _run_with_progress(
        self,
        scene_id: str,
        cmd: list[str],
    ) -> StepResult:
        """Run segmentation subprocess and parse progress."""
        import asyncio
        import os

        merged_env = os.environ.copy()
        profile = settings.load_hardware_profile()
        if profile and profile.cuda_home:
            merged_env["CUDA_HOME"] = profile.cuda_home

        await self.write_log(scene_id, f"$ {' '.join(cmd)}")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=merged_env,
        )

        if self._orchestrator:
            self._orchestrator.register_process(scene_id, proc)

        re_progress = re.compile(r"SEG_PROGRESS:(\d+)/(\d+)")
        stderr_lines: list[str] = []

        async def _read_stderr(stream: asyncio.StreamReader | None) -> None:
            if stream is None:
                return
            while True:
                data = await stream.readline()
                if not data:
                    break
                line = data.decode("utf-8", errors="replace").rstrip()
                stderr_lines.append(line)
                await self.write_log(scene_id, f"[ERR] {line}")

        async def _read_stdout(stream: asyncio.StreamReader | None) -> None:
            if stream is None:
                return
            while True:
                data = await stream.readline()
                if not data:
                    break
                line = data.decode("utf-8", errors="replace").rstrip()
                await self.write_log(scene_id, f"[OUT] {line}")
                m = re_progress.search(line)
                if m:
                    completed = int(m.group(1))
                    total = int(m.group(2))
                    await self.push_websocket(scene_id, {
                        "type": "depth_progress",
                        "data": {"completed": completed, "total": total},
                    })

        try:
            await asyncio.wait_for(
                asyncio.gather(
                    _read_stdout(proc.stdout),
                    _read_stderr(proc.stderr),
                    proc.wait(),
                ),
                timeout=3600.0,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if self._orchestrator:
                self._orchestrator.unregister_process(scene_id)
            return StepResult(
                exit_code=2,
                message="Segmentation timed out after 60 minutes.",
                duration_seconds=self.elapsed_time,
            )

        if self._orchestrator:
            self._orchestrator.unregister_process(scene_id)

        if proc.returncode != 0:
            last_err = "\n".join(stderr_lines[-5:]) if stderr_lines else "No stderr"
            return StepResult(
                exit_code=1,
                message=f"Segmentation failed (non-fatal): {last_err}",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(exit_code=0, message="OK", duration_seconds=self.elapsed_time)
