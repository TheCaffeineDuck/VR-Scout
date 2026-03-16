"""Pipeline control endpoints."""

import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request

from ..config import settings
from ..db import get_latest_run, get_scene
from ..models.pipeline import PipelineConfig
from ..security import (
    general_limiter,
    pipeline_limiter,
    sanitize_path,
    validate_scene_id,
)
from ..services import pipeline_service
from ..services.metrics_parser import parse_metrics_file
from ..services.status_watcher import read_status_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pipeline")


@router.post("/start/{scene_id}")
async def start_pipeline(
    scene_id: str, config: PipelineConfig, request: Request,
) -> dict[str, str]:
    """Start the pipeline for a scene."""
    logger.info("START PIPELINE called for scene_id=%s", scene_id)
    try:
        client_ip = request.client.host if request.client else "unknown"
        pipeline_limiter.check_or_raise(client_ip)
        validate_scene_id(scene_id)

        scene = await get_scene(scene_id)
        if scene is None:
            raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

        if pipeline_service.is_running(scene_id):
            raise HTTPException(status_code=409, detail="Pipeline already running")

        # Validate video file exists before launching subprocess
        video_path = settings.scenes_path / scene_id / "raw" / f"{scene_id}.mp4"
        if not video_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"No video file found for scene '{scene_id}'. Upload a video first.",
            )

        run_id = await pipeline_service.start_pipeline(scene_id, config)
        return {"run_id": run_id, "status": "started"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Pipeline start failed for scene %s", scene_id)
        raise HTTPException(status_code=500, detail=str(e) or f"Pipeline failed to start ({type(e).__name__})")


@router.post("/resume/{scene_id}/{step}")
async def resume_pipeline(
    scene_id: str, step: int, config: PipelineConfig, request: Request,
) -> dict[str, str]:
    """Resume pipeline from a specific step."""
    client_ip = request.client.host if request.client else "unknown"
    pipeline_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    if step < 1 or step > 9:
        raise HTTPException(status_code=400, detail=f"Invalid step number: {step} (must be 1-9)")

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    if pipeline_service.is_running(scene_id):
        raise HTTPException(status_code=409, detail="Pipeline already running")

    if step > len(pipeline_service.PIPELINE_STEPS):
        raise HTTPException(status_code=400, detail=f"Invalid step number: {step}")

    try:
        run_id = await pipeline_service.start_pipeline(scene_id, config, resume_from=step)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"run_id": run_id, "status": "resumed"}


@router.post("/cancel/{scene_id}")
async def cancel_pipeline(scene_id: str, request: Request) -> dict[str, str]:
    """Cancel a running pipeline."""
    client_ip = request.client.host if request.client else "unknown"
    pipeline_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    cancelled = await pipeline_service.cancel_pipeline(scene_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="No running pipeline to cancel")
    return {"status": "cancelled"}


@router.get("/status/{scene_id}")
async def get_status(scene_id: str, request: Request) -> dict[str, object]:
    """Get current pipeline status from status.json."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

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
    request: Request,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
) -> dict[str, object]:
    """Get log content for a pipeline step (paginated)."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    if step < 0 or step > 9:
        raise HTTPException(status_code=400, detail=f"Invalid step number: {step} (must be 0-9)")

    logs_dir = sanitize_path(settings.scenes_path, scene_id) / "logs"
    matches = sorted(logs_dir.glob(f"step_{step}_*.log")) if logs_dir.is_dir() else []
    if not matches:
        raise HTTPException(status_code=404, detail=f"No log for step {step}")
    log_path = matches[0]

    lines = log_path.read_text(encoding="utf-8").splitlines()
    total = len(lines)
    page = lines[offset : offset + limit]
    return {"lines": page, "total": total, "offset": offset}


@router.get("/validation/{scene_id}")
async def get_validation(scene_id: str, request: Request) -> dict[str, object]:
    """Get validation report for a scene."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    # Try file first
    validation_path = sanitize_path(settings.scenes_path, scene_id) / "validation_report.json"
    if validation_path.exists():
        data = json.loads(validation_path.read_text(encoding="utf-8"))
        return data  # type: ignore[no-any-return]

    # Fallback to database
    run = await get_latest_run(scene_id)
    if run is not None and run.validation_report is not None:
        return run.validation_report.model_dump()

    raise HTTPException(status_code=404, detail="No validation report found")


@router.get("/metrics/{scene_id}")
async def get_metrics(scene_id: str, request: Request) -> list[dict[str, object]]:
    """Get training metrics for a scene."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    metrics = parse_metrics_file(scene_id)
    return [m.model_dump() for m in metrics]


@router.get("/runs/{scene_id}")
async def get_runs(scene_id: str, request: Request) -> dict[str, object]:
    """Get the latest pipeline run for a scene."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    run = await get_latest_run(scene_id)
    if run is None:
        raise HTTPException(status_code=404, detail="No pipeline runs found")
    return run.model_dump()
