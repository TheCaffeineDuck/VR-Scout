"""Pipeline orchestrator for running, cancelling, and resuming steps."""

from __future__ import annotations

from server.models import PipelineConfig


class PipelineOrchestrator:
    """Coordinates sequential execution of pipeline steps for a scene."""

    async def run_pipeline(self, scene_id: str, config: PipelineConfig) -> None:
        """Run all pipeline steps from start to finish."""
        pass

    async def cancel(self, scene_id: str) -> None:
        """Cancel a running pipeline for the given scene."""
        pass

    async def resume(self, scene_id: str, from_step: int) -> None:
        """Resume a pipeline from the specified step number."""
        pass
