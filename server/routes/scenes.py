"""Scene CRUD endpoints."""

import json
import logging
import shutil

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from ..config import settings
from ..db import create_scene, delete_scene, get_scene, list_scenes, update_scene_config
from ..models.scene import AlignmentUpdate, SceneConfig, SceneCreate, SceneRow
from ..security import general_limiter, sanitize_path, validate_scene_id
from ..services import pipeline_service
from ..utils.colmap_reader import build_sparse_cloud_response

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/scenes")
async def get_scenes(request: Request) -> list[SceneRow]:
    """List all scenes with latest status."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    return await list_scenes()


@router.get("/api/scene/{scene_id}/config")
async def get_scene_config(scene_id: str, request: Request) -> SceneConfig:
    """Get scene config for the viewer."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")
    if scene.config is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' has no config")
    return scene.config


@router.post("/api/scenes", status_code=201)
async def create_new_scene(body: SceneCreate, request: Request) -> SceneRow:
    """Create a new scene."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(body.id)

    existing = await get_scene(body.id)
    if existing is not None:
        # Return existing scene (200) instead of blocking — allows re-upload/re-processing
        return JSONResponse(content=existing.model_dump(mode="json"), status_code=200)

    # Create scene directory — use sanitize_path for safety
    scene_dir = sanitize_path(settings.scenes_path, body.id)
    scene_dir.mkdir(parents=True, exist_ok=True)
    (scene_dir / "raw").mkdir(exist_ok=True)

    return await create_scene(body.id, body.name)


@router.put("/api/scene/{scene_id}/config")
async def update_config(scene_id: str, config: SceneConfig, request: Request) -> SceneRow:
    """Update scene config."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")
    result = await update_scene_config(scene_id, config)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to update scene config")
    return result


@router.put("/api/scene/{scene_id}/alignment")
async def update_alignment(
    scene_id: str, body: AlignmentUpdate, request: Request,
) -> dict[str, str]:
    """Update alignment.json for a scene."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    alignment_path = sanitize_path(settings.scenes_path, scene_id) / "alignment.json"
    alignment_path.write_text(json.dumps(body.alignment, indent=2), encoding="utf-8")
    return {"status": "ok"}


@router.get("/api/scene/{scene_id}/cameras")
async def get_cameras(scene_id: str, request: Request) -> dict[str, object]:
    """Get COLMAP camera positions for a scene."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    cameras_path = sanitize_path(settings.scenes_path, scene_id) / "cameras.json"
    if not cameras_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No camera data for scene '{scene_id}'",
        )
    data = json.loads(cameras_path.read_text(encoding="utf-8"))
    return data  # type: ignore[no-any-return]


@router.get("/api/scene/{scene_id}/sparse_cloud")
async def get_sparse_cloud(
    scene_id: str,
    request: Request,
    source: str = Query("sparse", pattern="^(sparse|aligned)$"),
) -> dict:
    """Get sparse point cloud and camera positions from COLMAP reconstruction.

    Query params:
        source: 'sparse' (default) reads from sparse/0/, 'aligned' reads from aligned/.
    """
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    scene_dir = sanitize_path(settings.scenes_path, scene_id)
    if not scene_dir.exists():
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    # Determine which model directory to read
    if source == "aligned":
        model_dir = scene_dir / "aligned"
        if not model_dir.exists():
            raise HTTPException(
                status_code=404,
                detail="Alignment has not been run yet",
            )
    else:
        # Default: read from sparse/0/ or best model path
        model_dir = scene_dir / "sparse" / "0"
        best_model_file = scene_dir / ".best_model_path"
        if best_model_file.exists():
            best_path = best_model_file.read_text(encoding="utf-8").strip()
            candidate = scene_dir / best_path
            if candidate.exists():
                model_dir = candidate
        if not model_dir.exists():
            raise HTTPException(
                status_code=404,
                detail="Sparse reconstruction not available yet",
            )

    # Try to get unregistered images from validation report
    unregistered: list[str] = []
    validation_path = scene_dir / "validation_report.json"
    if validation_path.exists():
        try:
            report = json.loads(validation_path.read_text(encoding="utf-8"))
            unregistered = report.get("unregistered_images", [])
        except (json.JSONDecodeError, KeyError):
            pass

    try:
        return build_sparse_cloud_response(
            str(model_dir),
            max_points=50000,
            unregistered_images=unregistered,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception("Failed to parse COLMAP model at %s", model_dir)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read COLMAP model: {e}",
        ) from e


@router.get("/api/scene/{scene_id}/metadata")
async def get_scene_metadata(scene_id: str, request: Request) -> dict:
    """Get extracted metadata for a scene.

    Returns the contents of metadata.json, populated after Step 1.5
    (metadata extraction) in the pipeline.
    """
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    metadata_path = sanitize_path(settings.scenes_path, scene_id) / "metadata.json"
    if not metadata_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No metadata available for scene '{scene_id}'. "
            "Metadata is extracted during pipeline Step 1.",
        )

    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read metadata for scene %s: %s", scene_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to read metadata file",
        ) from exc

    return data  # type: ignore[no-any-return]


@router.delete("/api/scenes/{scene_id}")
async def delete_scene_endpoint(scene_id: str, request: Request) -> dict[str, str]:
    """Delete a scene and all associated data."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    if pipeline_service.is_running(scene_id):
        raise HTTPException(
            status_code=409,
            detail="Cannot delete scene while pipeline is running. Cancel the pipeline first.",
        )

    # Delete from database
    await delete_scene(scene_id)

    # Delete scene directory on disk
    scene_dir = sanitize_path(settings.scenes_path, scene_id)
    if scene_dir.exists():
        shutil.rmtree(scene_dir, ignore_errors=True)

    # Delete raw video files matching this scene
    for raw_file in settings.raw_path.glob(f"{scene_id}.*"):
        try:
            raw_file.unlink()
        except OSError:
            pass

    return {"deleted": scene_id}


@router.delete("/api/scene/{scene_id}/video")
async def delete_scene_video(scene_id: str, request: Request) -> dict[str, object]:
    """Delete only the raw video file(s) for a scene, keeping all other data."""
    client_ip = request.client.host if request.client else "unknown"
    general_limiter.check_or_raise(client_ip)
    validate_scene_id(scene_id)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    freed_bytes = 0
    found = False
    for raw_file in settings.raw_path.glob(f"{scene_id}.*"):
        try:
            freed_bytes += raw_file.stat().st_size
            raw_file.unlink()
            found = True
        except OSError:
            pass

    if not found:
        raise HTTPException(status_code=404, detail=f"No video file found for scene '{scene_id}'")

    return {"deleted_video": True, "freed_mb": round(freed_bytes / (1024 * 1024), 1)}
