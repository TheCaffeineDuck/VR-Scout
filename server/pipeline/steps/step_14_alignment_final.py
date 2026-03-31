"""Step 14: Final alignment -- apply user corrections to the scene."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class AlignmentFinalStep(StepBase):
    """Apply final user-driven alignment, crop, and scale adjustments."""

    step_num: int = 14
    step_name: str = "alignment_final"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Bake user alignment edits into the SPZ and mesh assets."""
        return StepResult(exit_code=0, message="stub")
