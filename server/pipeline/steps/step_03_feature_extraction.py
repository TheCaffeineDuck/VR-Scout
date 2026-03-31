"""Step 3: Feature extraction -- detect keypoints and descriptors."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class FeatureExtractionStep(StepBase):
    """Extract SIFT or learned features from each frame for SfM matching."""

    step_num: int = 3
    step_name: str = "feature_extraction"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run COLMAP feature extraction on the image set."""
        return StepResult(exit_code=0, message="stub")
