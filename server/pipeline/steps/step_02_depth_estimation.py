"""Step 2: Depth estimation -- run monocular depth on extracted frames."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class DepthEstimationStep(StepBase):
    """Generate per-frame depth maps using a monocular depth model."""

    step_num: int = 2
    step_name: str = "depth_estimation"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run depth estimation model on all extracted frames."""
        return StepResult(exit_code=0, message="stub")
