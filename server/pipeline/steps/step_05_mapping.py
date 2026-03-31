"""Step 5: Mapping -- run Structure-from-Motion reconstruction."""

from __future__ import annotations

import re
from pathlib import Path

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class MappingStep(StepBase):
    """Perform incremental SfM to build a sparse 3-D point cloud."""

    step_num: int = 5
    step_name: str = "mapping"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run COLMAP mapper to produce a sparse reconstruction."""
        scene_dir = self.get_scene_dir(scene_id)
        frames_dir = scene_dir / "frames"
        db_path = scene_dir / "colmap.db"
        sparse_dir = scene_dir / "sparse"
        sparse_dir.mkdir(parents=True, exist_ok=True)

        if not db_path.exists():
            return StepResult(
                exit_code=2,
                message="COLMAP database not found — run matching first",
                duration_seconds=self.elapsed_time,
            )

        # Run COLMAP mapper (incremental SfM)
        cmd = [
            "colmap", "mapper",
            "--database_path", str(db_path),
            "--image_path", str(frames_dir),
            "--output_path", str(sparse_dir),
        ]

        result = await self.run_subprocess(scene_id, cmd, timeout=7200.0)
        if result.exit_code != 0:
            return result

        # Find all model directories
        model_dirs = sorted(
            [d for d in sparse_dir.iterdir() if d.is_dir()],
            key=lambda d: d.name,
        )

        if not model_dirs:
            return StepResult(
                exit_code=2,
                message="COLMAP produced no reconstruction models",
                duration_seconds=self.elapsed_time,
            )

        # Select best model (largest images.bin)
        best_model = model_dirs[0]
        best_size = 0
        for model_dir in model_dirs:
            images_bin = model_dir / "images.bin"
            if images_bin.exists():
                size = images_bin.stat().st_size
                if size > best_size:
                    best_size = size
                    best_model = model_dir

        await self.write_log(
            scene_id,
            f"Found {len(model_dirs)} model(s), selected {best_model.name} "
            f"(images.bin: {best_size / 1024:.0f} KB)",
        )

        # Run model_analyzer for registration stats
        registration_rate = await self._get_registration_rate(scene_id, best_model)
        await self.write_log(scene_id, f"Registration rate: {registration_rate:.1f}%")

        # Write best model path for downstream steps
        (scene_dir / "best_model.txt").write_text(str(best_model), encoding="utf-8")

        # Multiple models warning
        exit_code = 0
        messages: list[str] = [f"Registration rate: {registration_rate:.1f}%"]

        if len(model_dirs) > 1:
            exit_code = 1
            messages.append(f"Multiple models ({len(model_dirs)}) — selected {best_model.name}")

        # Registration gates
        if registration_rate < 50:
            return StepResult(
                exit_code=2,
                message=f"Registration rate too low: {registration_rate:.1f}% (need 50%+). "
                "Try different camera_model or matcher settings.",
                duration_seconds=self.elapsed_time,
            )
        if registration_rate < 90:
            exit_code = max(exit_code, 1)
            messages.append("Registration below 90% — results may have gaps")

        return StepResult(
            exit_code=exit_code,
            message="; ".join(messages),
            duration_seconds=self.elapsed_time,
        )

    async def _get_registration_rate(self, scene_id: str, model_dir: Path) -> float:
        """Run colmap model_analyzer and parse the registration rate."""
        import asyncio

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

        # Parse "Registered images: X / Y" or similar
        match = re.search(r"Registered images\s*[:=]\s*(\d+)", output)
        if not match:
            await self.write_log(scene_id, "Could not parse registration count from model_analyzer")
            return 0.0

        registered = int(match.group(1))

        # Count total frames
        frames_dir = self.get_scene_dir(scene_id) / "frames"
        total = len(list(frames_dir.glob("frame_*.jpg")))
        if total == 0:
            return 0.0

        return (registered / total) * 100.0
