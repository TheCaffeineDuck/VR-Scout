"""Step 4: Feature matching -- match keypoints across frame pairs."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class MatchingStep(StepBase):
    """Match features between image pairs using the configured matcher."""

    step_num: int = 4
    step_name: str = "matching"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run COLMAP exhaustive, sequential, or spatial matching."""
        return StepResult(exit_code=0, message="stub")
