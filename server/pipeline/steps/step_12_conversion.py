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
        return StepResult(exit_code=0, message="stub")
