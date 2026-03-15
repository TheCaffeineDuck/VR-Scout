"""Pipeline control endpoints."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from ..config import settings
from ..db import get_latest_run, get_scene
from ..models.pipeline import PipelineConfig
from ..services import pipeline_service
from ..services.metrics_parser import parse_metrics_file
from ..services.status_watcher import read_status_file

router = APIRouter(prefix="/api/pipeline")


@router.post("/start/{scene_id}")
async def start_pipeline(scene_id: str, config: PipelineConfig) -> dict[str, str]:
    """Start the pipeline for a scene."""
    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    if pipeline_service.is_running(scene_id):
        raise HTTPException(status_code=409, detail="Pipeline already running")

    try:
        run_id = await pipeline_service.start_pipeline(scene_id, config)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"run_id": run_id, "status": "started"}


@router.post("/resume/{scene_id}/{step}")
async def resume_pipeline(
    scene_id: str, step: int, config: PipelineConfig
) -> dict[str, str]:
    """Resume pipeline from a specific step."""
    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    if pipeline_service.is_running(scene_id):
        raise HTTPException(status_code=409, detail="Pipeline already running")

    if step < 1 or step > len(pipeline_service.PIPELINE_STEPS):
        raise HTTPException(status_code=400, detail=f"Invalid step number: {step}")

    try:
        run_id = await pipeline_service.start_pipeline(scene_id, config, resume_from=step)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"run_id": run_id, "status": "resumed"}


@router.post("/cancel/{scene_id}")
async def cancel_pipeline(scene_id: str) -> dict[str, str]:
    """Cancel a running pipeline."""
    cancelled = await pipeline_service.cancel_pipeline(scene_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="No running pipeline to cancel")
    return {"status": "cancelled"}


@router.get("/status/{scene_id}")
async def get_status(scene_id: str) -> dict[str, object]:
    """Get current pipeline status from status.json."""
    _validate_scene_id(scene_id)
    status = read_status_file(scene_id)
    if status is not None:
        return status.model_dump()

    # Fallback to database
    run = await get_latest_run(scene_id)
    if run is None:
        raise HTTPException(status_code=404, detail="No pipeline runs found")
    return {"status": run.status, "scene_id": scene_id}


@router.get("/logs/{scene_id}/{step}")
async def get_logs(
    scene_id: str,
    step: int,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
) -> dict[str, object]:
    """Get log content for a pipeline step (paginated)."""
    _validate_scene_id(scene_id)
    log_path = settings.scenes_path / scene_id / "logs" / f"step_{step}.log"
    if not log_path.exists():
        raise HTTPException(status_code=404, detail=f"No log for step {step}")

    lines = log_path.read_text(encoding="utf-8").splitlines()
    total = len(lines)
    page = lines[offset : offset + limit]
    return {"lines": page, "total": total, "offset": offset}


@router.get("/validation/{scene_id}")
async def get_validation(scene_id: str) -> dict[str, object]:
    """Get validation report for a scene."""
    _validate_scene_id(scene_id)

    # Try file first
    validation_path = settings.scenes_path / scene_id / "validation_report.json"
    if validation_path.exists():
        data = json.loads(validation_path.read_text(encoding="utf-8"))
        return data  # type: ignore[no-any-return]

    # Fallback to database
    run = await get_latest_run(scene_id)
    if run is not None and run.validation_report is not None:
        return run.validation_report.model_dump()

    raise HTTPException(status_code=404, detail="No validation report found")


@router.get("/metrics/{scene_id}")
async def get_metrics(scene_id: str) -> list[dict[str, object]]:
    """Get training metrics for a scene."""
    _validate_scene_id(scene_id)
    metrics = parse_metrics_file(scene_id)
    return [m.model_dump() for m in metrics]


@router.get("/runs/{scene_id}")
async def get_runs(scene_id: str) -> dict[str, object]:
    """Get the latest pipeline run for a scene."""
    run = await get_latest_run(scene_id)
    if run is None:
        raise HTTPException(status_code=404, detail="No pipeline runs found")
    return run.model_dump()


def _validate_scene_id(scene_id: str) -> None:
    """Validate scene_id to prevent path traversal attacks."""
    normalized = Path(scene_id).name
    if normalized != scene_id or ".." in scene_id or "/" in scene_id or "\\" in scene_id:
        raise HTTPException(status_code=400, detail="Invalid scene ID")
