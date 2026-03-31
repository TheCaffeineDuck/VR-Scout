"""Step 0: Preflight checks -- verify disk space, GPU, and dependencies."""

from __future__ import annotations

import os
import shutil

from server.config import settings
from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class PreflightStep(StepBase):
    """Verify system prerequisites before starting the pipeline."""

    step_num: int = 0
    step_name: str = "preflight"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Check disk space, GPU availability, CUDA, and tool paths."""
        errors: list[str] = []
        warnings: list[str] = []

        # 1. Hardware profile
        profile_path = settings.hardware_profile_abs_path
        if not profile_path.exists():
            errors.append(
                f"Hardware profile not found at {profile_path}. "
                "Run scripts/setup_environment.sh first."
            )
        else:
            profile = settings.load_hardware_profile()
            await self.write_log(
                scene_id,
                f"Hardware profile: {profile.profile.value} "
                f"(GPU: {profile.gpu_name}, VRAM: {profile.gpu_vram_gb}GB)",
            )

        # 2. nvidia-smi
        if not shutil.which("nvidia-smi"):
            errors.append("nvidia-smi not found in PATH")
        else:
            result = await self.run_subprocess(
                scene_id,
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            )
            if result.exit_code != 0:
                errors.append("nvidia-smi query failed")

        # 3. CUDA_HOME
        cuda_home = os.environ.get("CUDA_HOME", "")
        if not cuda_home:
            errors.append("CUDA_HOME environment variable is not set")
        else:
            await self.write_log(scene_id, f"CUDA_HOME: {cuda_home}")

        # 4. Required tools
        for tool in ["colmap", "ffmpeg", "exiftool"]:
            path = shutil.which(tool)
            if not path:
                errors.append(f"{tool} not found in PATH")
            else:
                await self.write_log(scene_id, f"{tool}: {path}")

        # 5. 3dgsconverter (warning only — needed for step 12)
        if not shutil.which("3dgsconverter"):
            warnings.append("3dgsconverter not found in PATH (needed for SPZ conversion)")

        # 6. gsplat trainer
        trainer_path = settings.gsplat_dir / "examples" / "simple_trainer.py"
        if not trainer_path.exists():
            warnings.append(f"gsplat trainer not found at {trainer_path}")
        else:
            await self.write_log(scene_id, f"gsplat trainer: {trainer_path}")

        # 7. Disk space
        scene_dir = self.get_scene_dir(scene_id)
        scene_dir.mkdir(parents=True, exist_ok=True)
        disk_usage = shutil.disk_usage(str(scene_dir))
        free_gb = disk_usage.free / (1024**3)
        await self.write_log(scene_id, f"Disk free: {free_gb:.1f} GB")
        if free_gb < 10:
            errors.append(f"Insufficient disk space: {free_gb:.1f} GB free (need 10+ GB)")

        # Build result
        if errors:
            msg = "Preflight FAILED:\n" + "\n".join(f"  - {e}" for e in errors)
            if warnings:
                msg += "\nWarnings:\n" + "\n".join(f"  - {w}" for w in warnings)
            return StepResult(exit_code=2, message=msg, duration_seconds=self.elapsed_time)

        if warnings:
            msg = "Preflight passed with warnings:\n" + "\n".join(f"  - {w}" for w in warnings)
            return StepResult(exit_code=1, message=msg, duration_seconds=self.elapsed_time)

        return StepResult(
            exit_code=0,
            message="All preflight checks passed",
            duration_seconds=self.elapsed_time,
        )
