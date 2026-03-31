"""Step 0: Preflight checks -- verify disk space, GPU, and dependencies."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class PreflightStep(StepBase):
    """Verify system prerequisites before starting the pipeline."""

    step_num: int = 0
    step_name: str = "preflight"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Check disk space, GPU availability, CUDA, and tool paths."""
        return StepResult(exit_code=0, message="stub")
