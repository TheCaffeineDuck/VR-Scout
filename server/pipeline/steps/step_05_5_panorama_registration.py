"""Step 5.5: Panorama registration -- register equirectangular images."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class PanoramaRegistrationStep(StepBase):
    """Split panoramas into cube faces and register them into the SfM model."""

    step_num: int = 55  # logical 5.5, stored as int
    step_name: str = "panorama_registration"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Split equirectangular panoramas and register cube-map faces."""
        return StepResult(exit_code=0, message="stub")
