"""Pipeline control and monitoring routes."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from server import database as db
from server.config import settings
from server.models import (
    PipelineConfig,
    SceneStatus,
    StepStatusEnum,
    TrainingMetric,
    ValidationReport,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/start/{scene_id}")
async def start_pipeline(
    scene_id: str,
    config: PipelineConfig,
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Start a full pipeline run for the given scene."""
    scene = await db.get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    orchestrator = request.app.state.orchestrator
    await orchestrator.run_pipeline(scene_id, config)

    return {"status": "started", "scene_id": scene_id}


@router.post("/resume/{scene_id}/{step}")
async def resume_pipeline(
    scene_id: str,
    step: int,
    request: Request,
) -> dict[str, str]:
    """Resume a paused or failed pipeline from the specified step."""
    orchestrator = request.app.state.orchestrator
    try:
        await orchestrator.resume(scene_id, step)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return {"status": "resumed", "scene_id": scene_id, "from_step": str(step)}


@router.post("/cancel/{scene_id}")
async def cancel_pipeline(
    scene_id: str,
    request: Request,
) -> dict[str, str]:
    """Cancel a running pipeline for the given scene."""
    orchestrator = request.app.state.orchestrator
    await orchestrator.cancel(scene_id)
    return {"status": "cancelled", "scene_id": scene_id}


@router.post("/confirm/{scene_id}")
async def confirm_pipeline(
    scene_id: str,
    request: Request,
) -> dict[str, str]:
    """Confirm the validation checkpoint and continue the pipeline."""
    orchestrator = request.app.state.orchestrator
    orchestrator.confirm(scene_id)
    return {"status": "confirmed", "scene_id": scene_id}


@router.get("/status/{scene_id}")
async def get_pipeline_status(scene_id: str) -> SceneStatus:
    """Return the current pipeline status for a scene."""
    latest_run = await db.get_latest_run(scene_id)
    if latest_run is None:
        return SceneStatus(scene_id=scene_id)

    statuses = await db.get_pipeline_status(scene_id)

    # Find the current/latest step
    current_step = None
    current_step_name = None
    overall_status = StepStatusEnum(str(latest_run["status"]))
    message = None

    for s in reversed(statuses):
        status_val = str(s["status"])
        if status_val in ("running", "failed", "blocked", "awaiting_confirmation", "warning"):
            current_step = int(str(s["step_num"]))
            current_step_name = str(s["step_name"])
            message = str(s["message"]) if s["message"] else None
            overall_status = StepStatusEnum(status_val)
            break

    return SceneStatus(
        scene_id=scene_id,
        status=overall_status,
        current_step=current_step,
        current_step_name=current_step_name,
        message=message,
    )


@router.get("/steps/{scene_id}")
async def get_all_step_statuses(scene_id: str) -> list[dict[str, object]]:
    """Return all step statuses for the latest pipeline run."""
    return await db.get_pipeline_status(scene_id)


@router.get("/logs/{scene_id}/{step}")
async def get_step_logs(
    scene_id: str,
    step: int,
    lines: int = 200,
    offset: int = 0,
) -> dict[str, object]:
    """Return log file content for a specific step."""
    scene_dir = settings.scenes_path / scene_id / "logs"

    # Find the log file for this step
    log_files = list(scene_dir.glob(f"step_{step:02d}_*.log"))
    if not log_files:
        raise HTTPException(status_code=404, detail=f"No log file found for step {step}")

    log_path = log_files[0]
    try:
        all_lines = log_path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Log file not found")

    total = len(all_lines)
    selected = all_lines[offset : offset + lines]

    return {
        "scene_id": scene_id,
        "step": step,
        "total_lines": total,
        "offset": offset,
        "lines": selected,
    }


@router.get("/validation/{scene_id}")
async def get_validation(scene_id: str) -> ValidationReport:
    """Return the SfM validation report for a scene."""
    report_path = settings.scenes_path / scene_id / "validation_report.json"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Validation report not found")

    try:
        data = json.loads(report_path.read_text(encoding="utf-8"))
        return ValidationReport(**data)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse validation report: {exc}")


@router.get("/metrics/{scene_id}")
async def get_training_metrics(scene_id: str) -> list[TrainingMetric]:
    """Return training metrics collected during the training step."""
    metrics_path = settings.scenes_path / scene_id / "output" / "training_metrics.log"
    if not metrics_path.exists():
        return []

    metrics: list[TrainingMetric] = []
    try:
        for line in metrics_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                data = json.loads(line)
                metrics.append(TrainingMetric(**data))
    except (json.JSONDecodeError, ValueError):
        pass

    return metrics
