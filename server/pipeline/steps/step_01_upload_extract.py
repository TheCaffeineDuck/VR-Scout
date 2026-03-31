"""Step 1: Upload and extract -- ingest video and extract frames."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class UploadExtractStep(StepBase):
    """Receive uploaded video, detect scene changes, and extract frames."""

    step_num: int = 1
    step_name: str = "upload_extract"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Extract frames from video using ffmpeg with scene-change detection."""
        return StepResult(exit_code=0, message="stub")
