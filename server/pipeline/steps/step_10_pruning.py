"""Step 10: Pruning -- reduce gaussian count for target platforms."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class PruningStep(StepBase):
    """Perceptually prune gaussians to meet desktop and Quest budgets."""

    step_num: int = 10
    step_name: str = "pruning"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run perceptual pruning to reduce gaussian count."""
        return StepResult(exit_code=0, message="stub")
