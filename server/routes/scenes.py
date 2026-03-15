"""Scene CRUD endpoints."""

import json

from fastapi import APIRouter, HTTPException, Request

from ..config import settings
from ..db import create_scene, get_scene, list_scenes, update_scene_config
from ..models.scene import AlignmentUpdate, SceneConfig, SceneCreate, SceneRow
from ..security import general_limiter, sanitize_path, validate_scene_id

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
        raise HTTPException(status_code=409, detail=f"Scene '{body.id}' already exists")

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
    assert result is not None
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
