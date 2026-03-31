"""Step 13: Video render -- produce a fly-through preview video."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class VideoRenderStep(StepBase):
    """Render a camera-path fly-through video of the gaussian scene."""

    step_num: int = 13
    step_name: str = "video_render"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Render fly-through frames and encode to MP4."""
        return StepResult(exit_code=0, message="stub")
