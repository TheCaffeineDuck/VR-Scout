"""Step 7: Validation -- verify SfM quality before training."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class ValidationStep(StepBase):
    """Check registration rate, reprojection error, and coverage."""

    step_num: int = 7
    step_name: str = "validation"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Compute and report SfM validation metrics."""
        return StepResult(exit_code=0, message="stub")
