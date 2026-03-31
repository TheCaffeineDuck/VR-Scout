"""Step 12: Conversion -- export to SPZ format for web and Quest."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class ConversionStep(StepBase):
    """Convert trained PLY models to compressed SPZ format."""

    step_num: int = 12
    step_name: str = "conversion"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Convert desktop and Quest PLY files to SPZ archives."""
        scene_dir = self.get_scene_dir(scene_id)
        output_dir = scene_dir / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        # Find the PLY file — prefer pruned if it exists
        ply_path = output_dir / "point_cloud_pruned.ply"
        if not ply_path.exists():
            ply_path = output_dir / "point_cloud.ply"
        if not ply_path.exists():
            return StepResult(
                exit_code=2,
                message="No PLY file found in output/ — run training first",
                duration_seconds=self.elapsed_time,
            )

        await self.write_log(scene_id, f"Source PLY: {ply_path.name}")
        warnings: list[str] = []

        # Desktop SPZ (moderate culling)
        desktop_spz = output_dir / "scene_desktop.spz"
        desktop_cmd = [
            "3dgsconverter",
            "-i", str(ply_path),
            "-o", str(desktop_spz),
            "--min_opacity", "5",
            "--sor_intensity", "3",
            "--compression_level", "5",
        ]

        result = await self.run_subprocess(scene_id, desktop_cmd)
        if result.exit_code != 0:
            return StepResult(
                exit_code=2,
                message=f"Desktop SPZ conversion failed: {result.message}",
                duration_seconds=self.elapsed_time,
            )

        # Quest SPZ (aggressive culling)
        quest_spz = output_dir / "scene_quest.spz"
        quest_cmd = [
            "3dgsconverter",
            "-i", str(ply_path),
            "-o", str(quest_spz),
            "--min_opacity", "8",
            "--sor_intensity", "5",
            "--compression_level", "5",
        ]

        result = await self.run_subprocess(scene_id, quest_cmd)
        if result.exit_code != 0:
            return StepResult(
                exit_code=2,
                message=f"Quest SPZ conversion failed: {result.message}",
                duration_seconds=self.elapsed_time,
            )

        # Validate outputs
        for label, spz_path, max_mb in [("Desktop", desktop_spz, 100), ("Quest", quest_spz, 50)]:
            if not spz_path.exists():
                return StepResult(
                    exit_code=2,
                    message=f"{label} SPZ file was not created",
                    duration_seconds=self.elapsed_time,
                )
            size_bytes = spz_path.stat().st_size
            if size_bytes < 1024:
                return StepResult(
                    exit_code=2,
                    message=f"{label} SPZ file is too small ({size_bytes} bytes) — likely corrupt",
                    duration_seconds=self.elapsed_time,
                )
            size_mb = size_bytes / (1024 * 1024)
            await self.write_log(scene_id, f"{label} SPZ: {size_mb:.1f} MB")
            if size_mb > max_mb:
                warnings.append(f"{label} SPZ is {size_mb:.1f} MB (recommended < {max_mb} MB)")

        if warnings:
            return StepResult(
                exit_code=1,
                message="; ".join(warnings),
                duration_seconds=self.elapsed_time,
            )

        return StepResult(
            exit_code=0,
            message="Desktop and Quest SPZ files created successfully",
            duration_seconds=self.elapsed_time,
        )
