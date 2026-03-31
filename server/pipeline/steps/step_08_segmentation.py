"""Step 8: Segmentation -- generate per-frame sky and transient masks."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class SegmentationStep(StepBase):
    """Produce binary masks for sky, people, and transient objects."""

    step_num: int = 8
    step_name: str = "segmentation"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run segmentation model to generate training masks."""
        return StepResult(exit_code=0, message="stub")
