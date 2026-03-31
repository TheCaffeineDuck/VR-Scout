"""Step 13: Video render -- produce a fly-through preview video."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from server.config import settings
from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class VideoRenderStep(StepBase):
    """Render a camera-path fly-through video of the gaussian scene."""

    step_num: int = 13
    step_name: str = "video_render"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Render fly-through frames and encode to MP4."""
        scene_dir = self.get_scene_dir(scene_id)
        aligned_dir = scene_dir / "aligned"
        output_dir = scene_dir / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        if not aligned_dir.exists() or not any(aligned_dir.iterdir()):
            return StepResult(
                exit_code=1,
                message="No aligned camera poses found. Skipping video render.",
                duration_seconds=self.elapsed_time,
            )

        # Find PLY for rendering
        input_ply = output_dir / "point_cloud_pruned.ply"
        if not input_ply.exists():
            input_ply = output_dir / "point_cloud.ply"
        if not input_ply.exists():
            return StepResult(
                exit_code=1,
                message="No point cloud found. Skipping video render.",
                duration_seconds=self.elapsed_time,
            )

        render_dir = scene_dir / "render_frames"
        render_dir.mkdir(parents=True, exist_ok=True)
        output_video = output_dir / "flythrough.mp4"

        await self.write_log(scene_id, "Rendering flythrough video...")

        # Step 1: Render frames via helper script
        script_path = Path(settings.project_root) / "scripts" / "run_video_render.py"
        render_cmd: list[str] = [
            sys.executable, str(script_path),
            "--input_ply", str(input_ply),
            "--cameras_dir", str(aligned_dir),
            "--output_dir", str(render_dir),
            "--resolution", "1920x1080",
        ]

        await self._run_with_progress(scene_id, render_cmd)

        # Check if we have rendered frames
        rendered_frames = sorted(render_dir.glob("frame_*.png"))
        if not rendered_frames:
            return StepResult(
                exit_code=1,
                message="No frames rendered. Skipping video encode.",
                duration_seconds=self.elapsed_time,
            )

        # Step 2: Encode to MP4 with ffmpeg
        await self.write_log(scene_id, f"Encoding {len(rendered_frames)} frames to MP4")
        frames_pattern = str(render_dir / "frame_%05d.png")

        ffmpeg_cmd: list[str] = [
            "ffmpeg", "-y",
            "-framerate", "30",
            "-i", frames_pattern,
            "-c:v", "libx264",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            str(output_video),
        ]

        await self.run_subprocess(scene_id, ffmpeg_cmd, timeout=600.0)

        # Clean up temporary render frames
        for f in rendered_frames:
            f.unlink(missing_ok=True)
        try:
            render_dir.rmdir()
        except OSError:
            pass

        if not output_video.exists():
            return StepResult(
                exit_code=1,
                message="Video encoding failed. Flythrough unavailable.",
                duration_seconds=self.elapsed_time,
            )

        video_mb = output_video.stat().st_size / (1024 * 1024)
        return StepResult(
            exit_code=0,
            message=f"Flythrough video: {video_mb:.1f}MB, {len(rendered_frames)} frames",
            duration_seconds=self.elapsed_time,
        )

    async def _run_with_progress(
        self,
        scene_id: str,
        cmd: list[str],
    ) -> StepResult:
        """Run render subprocess and parse progress."""
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

        re_progress = re.compile(r"VIDEO_PROGRESS:(\d+)/(\d+)")
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
                    frame = int(m.group(1))
                    total = int(m.group(2))
                    await self.push_websocket(scene_id, {
                        "type": "video_progress",
                        "data": {"frame": frame, "total_frames": total},
                    })

        try:
            await asyncio.wait_for(
                asyncio.gather(
                    _read_stdout(proc.stdout),
                    _read_stderr(proc.stderr),
                    proc.wait(),
                ),
                timeout=5400.0,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if self._orchestrator:
                self._orchestrator.unregister_process(scene_id)
            return StepResult(
                exit_code=1,
                message="Video render timed out.",
                duration_seconds=self.elapsed_time,
            )

        if self._orchestrator:
            self._orchestrator.unregister_process(scene_id)

        if proc.returncode != 0:
            last_err = "\n".join(stderr_lines[-5:]) if stderr_lines else "No stderr"
            return StepResult(
                exit_code=1,
                message=f"Video render failed (non-fatal): {last_err}",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(exit_code=0, message="OK", duration_seconds=self.elapsed_time)
