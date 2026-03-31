"""Step 5: Mapping -- run Structure-from-Motion reconstruction."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class MappingStep(StepBase):
    """Perform incremental SfM to build a sparse 3-D point cloud."""

    step_num: int = 5
    step_name: str = "mapping"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run COLMAP mapper to produce a sparse reconstruction."""
        return StepResult(exit_code=0, message="stub")
