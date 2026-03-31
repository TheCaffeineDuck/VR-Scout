"""Step 2: Depth estimation -- run monocular depth on extracted frames."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from server.config import settings
from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class DepthEstimationStep(StepBase):
    """Generate per-frame depth maps using a monocular depth model."""

    step_num: int = 2
    step_name: str = "depth_estimation"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run depth estimation model on all extracted frames."""
        if not config.depth_estimation:
            return StepResult(
                exit_code=0,
                message="Skipped: depth estimation disabled in config.",
                duration_seconds=self.elapsed_time,
            )

        scene_dir = self.get_scene_dir(scene_id)
        frames_dir = scene_dir / "frames"
        depth_dir = scene_dir / "depth"
        depth_dir.mkdir(parents=True, exist_ok=True)

        # Count input frames
        frame_files = sorted(frames_dir.glob("frame_*.*"))
        if not frame_files:
            frame_files = sorted(frames_dir.glob("*.*"))
            frame_files = [f for f in frame_files if f.suffix.lower() in (".jpg", ".jpeg", ".png")]

        if not frame_files:
            return StepResult(
                exit_code=2,
                message="No frames found for depth estimation.",
                duration_seconds=self.elapsed_time,
            )

        total_frames = len(frame_files)
        await self.write_log(scene_id, f"Running depth estimation on {total_frames} frames")
        await self.write_log(scene_id, f"Model size: {config.depth_model_size}")

        # Run helper script
        script_path = Path(settings.project_root) / "scripts" / "run_depth_estimation.py"
        cmd: list[str] = [
            sys.executable, str(script_path),
            "--frames_dir", str(frames_dir),
            "--output_dir", str(depth_dir),
            "--model_size", config.depth_model_size,
        ]

        # Parse progress from stdout via custom subprocess handling
        result = await self._run_with_progress(scene_id, cmd, total_frames)
        if result.exit_code != 0:
            return result

        # Verify depth map count
        depth_files = list(depth_dir.glob("*.png"))
        depth_count = len(depth_files)

        if depth_count == 0:
            return StepResult(
                exit_code=2,
                message="Depth estimation produced no output files.",
                duration_seconds=self.elapsed_time,
            )

        if depth_count < total_frames:
            return StepResult(
                exit_code=1,
                message=f"Depth maps: {depth_count}/{total_frames} frames. Some frames missing.",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(
            exit_code=0,
            message=f"Depth estimation complete: {depth_count} depth maps generated.",
            duration_seconds=self.elapsed_time,
        )

    async def _run_with_progress(
        self,
        scene_id: str,
        cmd: list[str],
        total_frames: int,
    ) -> StepResult:
        """Run subprocess and parse DEPTH_PROGRESS lines for WS updates."""
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

        re_progress = re.compile(r"DEPTH_PROGRESS:(\d+)/(\d+)")
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
                message="Depth estimation timed out after 60 minutes.",
                duration_seconds=self.elapsed_time,
            )

        if self._orchestrator:
            self._orchestrator.unregister_process(scene_id)

        if proc.returncode != 0:
            last_err = "\n".join(stderr_lines[-5:]) if stderr_lines else "No stderr"
            return StepResult(
                exit_code=2 if proc.returncode != 1 else 1,
                message=f"Depth estimation failed: {last_err}",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(exit_code=0, message="OK", duration_seconds=self.elapsed_time)
