"""Step 11: Mesh extraction -- generate a collision mesh from gaussians."""

from __future__ import annotations

import sys
from pathlib import Path

from server.config import settings
from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class MeshExtractionStep(StepBase):
    """Extract a simplified collision mesh from the trained model."""

    step_num: int = 11
    step_name: str = "mesh_extraction"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Extract mesh and detect floor plane."""
        scene_dir = self.get_scene_dir(scene_id)
        output_dir = scene_dir / "output"

        # Find best PLY — pruned takes priority
        input_ply = output_dir / "point_cloud_pruned.ply"
        if not input_ply.exists():
            input_ply = output_dir / "point_cloud.ply"
        if not input_ply.exists():
            return StepResult(
                exit_code=2,
                message="No point cloud PLY found. Training must complete first.",
                duration_seconds=self.elapsed_time,
            )

        await self.write_log(scene_id, f"Extracting mesh from {input_ply.name}")

        script_path = Path(settings.project_root) / "scripts" / "run_mesh_extraction.py"
        cmd: list[str] = [
            sys.executable, str(script_path),
            "--input_ply", str(input_ply),
            "--output_dir", str(output_dir),
            "--simplify_to", "10000",
        ]

        result = await self.run_subprocess(scene_id, cmd, timeout=1800.0)

        # Check outputs regardless of exit code
        mesh_path = output_dir / "collision_mesh.glb"
        floor_path = output_dir / "floor_plane.json"

        if not floor_path.exists():
            await self.write_log(scene_id, "WARNING: No floor plane detected")
            if result.exit_code == 0:
                return StepResult(
                    exit_code=1,
                    message=(
                        "Mesh extracted but no floor plane detected. "
                        "Manual alignment may be needed."
                    ),
                    duration_seconds=self.elapsed_time,
                )

        if not mesh_path.exists():
            return StepResult(
                exit_code=1,
                message="Mesh extraction failed. Collision mesh unavailable.",
                duration_seconds=self.elapsed_time,
            )

        mesh_kb = mesh_path.stat().st_size / 1024
        return StepResult(
            exit_code=result.exit_code,
            message=f"Mesh extraction complete. Collision mesh: {mesh_kb:.0f}KB",
            duration_seconds=self.elapsed_time,
        )
