"""Pipeline control and monitoring routes."""

from __future__ import annotations

from fastapi import APIRouter

from server.models import (
    PipelineConfig,
    SceneStatus,
    StepStatus,
    TrainingMetric,
    ValidationReport,
)

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/start/{scene_id}")
async def start_pipeline(
    scene_id: str,
    config: PipelineConfig,
) -> dict[str, str]:
    """Start a full pipeline run for the given scene."""
    return {"status": "stub"}


@router.post("/resume/{scene_id}/{step}")
async def resume_pipeline(scene_id: str, step: int) -> dict[str, str]:
    """Resume a paused or failed pipeline from the specified step."""
    return {"status": "stub"}


@router.post("/cancel/{scene_id}")
async def cancel_pipeline(scene_id: str) -> dict[str, str]:
    """Cancel a running pipeline for the given scene."""
    return {"status": "stub"}


@router.get("/status/{scene_id}")
async def get_pipeline_status(scene_id: str) -> SceneStatus:
    """Return the current pipeline status for a scene."""
    return SceneStatus(scene_id=scene_id)


@router.get("/logs/{scene_id}/{step}")
async def get_step_logs(scene_id: str, step: int) -> list[StepStatus]:
    """Return log entries for a specific step of a scene run."""
    return []


@router.get("/validation/{scene_id}")
async def get_validation(scene_id: str) -> ValidationReport:
    """Return the SfM validation report for a scene."""
    return ValidationReport()


@router.get("/metrics/{scene_id}")
async def get_training_metrics(scene_id: str) -> list[TrainingMetric]:
    """Return training metrics collected during the training step."""
    return []
