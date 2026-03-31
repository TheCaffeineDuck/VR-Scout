"""Step 11: Mesh extraction -- generate a collision mesh from gaussians."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class MeshExtractionStep(StepBase):
    """Extract a simplified collision mesh from the trained model."""

    step_num: int = 11
    step_name: str = "mesh_extraction"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run marching cubes or TSDF fusion for collision geometry."""
        return StepResult(exit_code=0, message="stub")
