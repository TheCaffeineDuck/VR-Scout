"""Step 6: Alignment -- orient the reconstruction to real-world axes."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class AlignmentStep(StepBase):
    """Align the SfM reconstruction using gravity and GPS priors."""

    step_num: int = 6
    step_name: str = "alignment"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Apply gravity alignment and optional geo-registration."""
        return StepResult(exit_code=0, message="stub")
