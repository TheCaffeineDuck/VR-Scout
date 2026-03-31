"""Step 9: Training -- train the 3-D Gaussian Splatting model."""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
import sys
import time
from pathlib import Path

from server.config import settings
from server.models import PipelineConfig, StepResult, TrainingMetric
from server.pipeline.steps.base import StepBase


class TrainingStep(StepBase):
    """Train a gaussian splatting model with depth and mask supervision."""

    step_num: int = 9
    step_name: str = "training"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Launch gsplat training and stream metrics over WebSocket."""
        scene_dir = self.get_scene_dir(scene_id)
        aligned_dir = scene_dir / "aligned"
        frames_dir = scene_dir / "frames"
        output_dir = scene_dir / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        # Validate inputs
        if not aligned_dir.exists() or not any(aligned_dir.iterdir()):
            return StepResult(
                exit_code=2,
                message="No aligned COLMAP model found. Run SfM steps first.",
                duration_seconds=self.elapsed_time,
            )
        if not frames_dir.exists() or not any(frames_dir.iterdir()):
            return StepResult(
                exit_code=2,
                message="No frames found. Run frame extraction first.",
                duration_seconds=self.elapsed_time,
            )

        # Set up gsplat input directory structure
        gsplat_input_dir = scene_dir / "gsplat_input"
        result = await self._setup_gsplat_dirs(
            scene_id, gsplat_input_dir, frames_dir, aligned_dir,
        )
        if result is not None:
            return result

        # Build command
        gsplat_trainer = settings.gsplat_dir / "examples" / "simple_trainer.py"
        if not gsplat_trainer.exists():
            return StepResult(
                exit_code=2,
                message=f"gsplat trainer not found at {gsplat_trainer}. Run setup_environment.sh.",
                duration_seconds=self.elapsed_time,
            )

        cmd: list[str] = [
            sys.executable, str(gsplat_trainer), "mcmc",
            "--data_dir", str(gsplat_input_dir),
            "--result_dir", str(output_dir),
            "--use_bilateral_grid",
            "--max_steps", str(config.training_iterations),
        ]

        if config.data_factor > 1:
            cmd.extend(["--data_factor", str(config.data_factor)])

        if config.sh_degree != 1:
            cmd.extend(["--sh_degree", str(config.sh_degree)])

        # Add depth supervision if depth maps exist
        depth_dir = scene_dir / "depth"
        if depth_dir.exists() and any(depth_dir.glob("*.png")):
            cmd.append("--depth_loss")
            await self.write_log(scene_id, "Depth maps found — enabling depth supervision")

        # Add mask supervision if masks exist
        masks_dir = scene_dir / "masks"
        if masks_dir.exists() and any(masks_dir.glob("*.png")):
            await self.write_log(scene_id, "Masks found — mask supervision available")

        iters = config.training_iterations
        await self.write_log(scene_id, f"Starting training: {iters} iterations")
        await self.write_log(scene_id, f"$ {' '.join(cmd)}")

        # Build environment with CUDA_HOME
        merged_env = os.environ.copy()
        profile = settings.load_hardware_profile()
        if profile and profile.cuda_home:
            merged_env["CUDA_HOME"] = profile.cuda_home

        # Run training with real-time metric parsing
        return await self._run_training(scene_id, cmd, merged_env, config, output_dir)

    async def _setup_gsplat_dirs(
        self,
        scene_id: str,
        gsplat_input_dir: Path,
        frames_dir: Path,
        aligned_dir: Path,
    ) -> StepResult | None:
        """Create gsplat-compatible directory layout with symlinks.

        Returns a StepResult on error, None on success.
        """
        images_link = gsplat_input_dir / "images"
        sparse_dir = gsplat_input_dir / "sparse" / "0"

        try:
            gsplat_input_dir.mkdir(parents=True, exist_ok=True)
            sparse_dir.mkdir(parents=True, exist_ok=True)

            # Symlink images → frames
            if images_link.exists() or images_link.is_symlink():
                if images_link.is_symlink():
                    images_link.unlink()
                elif images_link.is_dir():
                    images_link.rmdir()
            images_link.symlink_to(frames_dir, target_is_directory=True)

            # Copy or symlink sparse model files
            for name in ("cameras.bin", "images.bin", "points3D.bin"):
                src = aligned_dir / name
                dst = sparse_dir / name
                if src.exists():
                    if dst.exists() or dst.is_symlink():
                        dst.unlink()
                    dst.symlink_to(src)

            await self.write_log(scene_id, "gsplat input directory prepared")
        except OSError as exc:
            return StepResult(
                exit_code=2,
                message=f"Failed to set up gsplat input directory: {exc}",
                duration_seconds=self.elapsed_time,
            )
        return None

    async def _run_training(
        self,
        scene_id: str,
        cmd: list[str],
        env: dict[str, str],
        config: PipelineConfig,
        output_dir: Path,
    ) -> StepResult:
        """Execute training subprocess with real-time metric parsing."""
        metrics_path = output_dir / "training_metrics.log"
        # Clear old metrics
        metrics_path.write_text("", encoding="utf-8")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        # Register with orchestrator for cancellation
        if self._orchestrator:
            self._orchestrator.register_process(scene_id, proc)

        last_psnr = 0.0
        last_loss = 0.0
        start_time = time.monotonic()

        # Regex patterns for gsplat output
        re_step = re.compile(r"[Ss]tep[:\s]+(\d+)(?:/(\d+))?")
        re_loss = re.compile(r"loss[:\s]+([\d.eE+-]+)")
        re_psnr = re.compile(r"psnr[:\s]+([\d.]+)", re.IGNORECASE)
        re_gs = re.compile(r"(?:alive|num.*?gauss|#GS)[:\s]+(\d+)", re.IGNORECASE)
        re_depth_loss = re.compile(r"depth.*?loss[:\s]+([\d.eE+-]+)", re.IGNORECASE)

        oom_detected = False
        nan_detected = False

        async def _read_stderr(stream: asyncio.StreamReader | None) -> None:
            nonlocal oom_detected
            if stream is None:
                return
            while True:
                line_bytes = await stream.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace").rstrip()
                await self.write_log(scene_id, f"[ERR] {line}")
                if "CUDA out of memory" in line or "OutOfMemoryError" in line:
                    oom_detected = True

        async def _read_stdout(stream: asyncio.StreamReader | None) -> None:
            nonlocal last_psnr, last_loss, nan_detected
            if stream is None:
                return
            while True:
                line_bytes = await stream.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace").rstrip()
                await self.write_log(scene_id, f"[OUT] {line}")

                # Parse metrics from line
                metric = self._parse_metric_line(
                    line, config.training_iterations, start_time,
                    re_step, re_loss, re_psnr, re_gs, re_depth_loss,
                )
                if metric is not None:
                    last_psnr = metric.psnr
                    last_loss = metric.loss

                    # Check for NaN
                    if math.isnan(metric.loss):
                        nan_detected = True
                        return

                    # Push WS update
                    await self.push_websocket(scene_id, {
                        "type": "metric",
                        "data": metric.model_dump(),
                    })

                    # Append to metrics log (JSONL)
                    with open(metrics_path, "a", encoding="utf-8") as f:
                        f.write(json.dumps(metric.model_dump(), default=str) + "\n")

        # Generous timeout: 0.5s per iteration
        timeout = max(config.training_iterations * 0.5, 3600.0)

        try:
            await asyncio.wait_for(
                asyncio.gather(
                    _read_stdout(proc.stdout),
                    _read_stderr(proc.stderr),
                    proc.wait(),
                ),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if self._orchestrator:
                self._orchestrator.unregister_process(scene_id)
            return StepResult(
                exit_code=2,
                message=f"Training timed out after {timeout:.0f}s",
                duration_seconds=self.elapsed_time,
            )

        if self._orchestrator:
            self._orchestrator.unregister_process(scene_id)

        # Handle error conditions
        if nan_detected:
            proc.kill()
            return StepResult(
                exit_code=2,
                message=(
                    "Training diverged (NaN loss detected). "
                    "Try reducing learning rate or increasing data_factor."
                ),
                duration_seconds=self.elapsed_time,
            )

        if oom_detected:
            return StepResult(
                exit_code=2,
                message=(
                    "CUDA out of memory. "
                    "Try increasing data_factor to 2 or 4 in pipeline config."
                ),
                duration_seconds=self.elapsed_time,
            )

        if proc.returncode != 0:
            return StepResult(
                exit_code=2,
                message=f"Training process exited with code {proc.returncode}",
                duration_seconds=self.elapsed_time,
            )

        # Validate output
        ply_path = output_dir / "point_cloud.ply"
        if not ply_path.exists():
            return StepResult(
                exit_code=2,
                message="Training completed but no point_cloud.ply was produced.",
                duration_seconds=self.elapsed_time,
            )

        ply_size = ply_path.stat().st_size
        if ply_size < 1024:
            return StepResult(
                exit_code=2,
                message=f"point_cloud.ply is suspiciously small ({ply_size} bytes).",
                duration_seconds=self.elapsed_time,
            )

        ply_mb = ply_size / (1024 * 1024)
        msg = f"Training complete. PLY size: {ply_mb:.1f}MB, final PSNR: {last_psnr:.2f}"

        if last_psnr > 0 and last_psnr < 22.0:
            return StepResult(
                exit_code=1,
                message=f"{msg} — PSNR below 22 dB, quality may be suboptimal.",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(
            exit_code=0,
            message=msg,
            duration_seconds=self.elapsed_time,
        )

    @staticmethod
    def _parse_metric_line(
        line: str,
        max_iterations: int,
        start_time: float,
        re_step: re.Pattern[str],
        re_loss: re.Pattern[str],
        re_psnr: re.Pattern[str],
        re_gs: re.Pattern[str],
        re_depth_loss: re.Pattern[str],
    ) -> TrainingMetric | None:
        """Try to extract training metrics from an output line."""
        step_match = re_step.search(line)
        loss_match = re_loss.search(line)
        if step_match is None or loss_match is None:
            return None

        iteration = int(step_match.group(1))
        max_iter = int(step_match.group(2)) if step_match.group(2) else max_iterations

        try:
            loss = float(loss_match.group(1))
        except ValueError:
            return None

        psnr_match = re_psnr.search(line)
        psnr = float(psnr_match.group(1)) if psnr_match else 0.0

        gs_match = re_gs.search(line)
        gaussian_count = int(gs_match.group(1)) if gs_match else 0

        depth_match = re_depth_loss.search(line)
        depth_loss = float(depth_match.group(1)) if depth_match else None

        elapsed = time.monotonic() - start_time
        rate = iteration / elapsed if elapsed > 0 else 1.0
        remaining = max_iter - iteration
        eta = remaining / rate if rate > 0 else 0.0

        return TrainingMetric(
            iteration=iteration,
            max_iterations=max_iter,
            loss=loss,
            depth_loss=depth_loss,
            psnr=psnr,
            gaussian_count=gaussian_count,
            elapsed_seconds=elapsed,
            eta_seconds=eta,
        )
