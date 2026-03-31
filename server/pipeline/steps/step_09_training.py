"""Step 9: Training -- train the 3-D Gaussian Splatting model."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class TrainingStep(StepBase):
    """Train a gaussian splatting model with depth and mask supervision."""

    step_num: int = 9
    step_name: str = "training"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Launch gsplat training and stream metrics over WebSocket."""
        return StepResult(exit_code=0, message="stub")
