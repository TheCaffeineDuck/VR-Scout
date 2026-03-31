"""Scene management routes."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from server.models import SceneConfig

router = APIRouter(prefix="/api", tags=["scenes"])


@router.get("/scenes")
async def list_scenes() -> list[SceneConfig]:
    """Return all scenes with their configurations."""
    return []


@router.get("/scene/{scene_id}/config")
async def get_scene_config(scene_id: str) -> SceneConfig:
    """Return the full configuration for a single scene."""
    return SceneConfig(id=scene_id, name="")


@router.get("/scene/{scene_id}/cameras")
async def get_cameras(scene_id: str) -> dict[str, object]:
    """Return extracted camera poses for a scene."""
    return {"scene_id": scene_id, "cameras": []}


@router.get("/scene/{scene_id}/mesh")
async def get_mesh(scene_id: str) -> FileResponse:
    """Serve the collision mesh file for a scene."""
    return FileResponse(path=f"scenes/{scene_id}/mesh.glb")


@router.get("/scene/{scene_id}/video")
async def get_video(scene_id: str) -> FileResponse:
    """Serve the fly-through preview video for a scene."""
    return FileResponse(path=f"scenes/{scene_id}/flythrough.mp4")


@router.put("/scene/{scene_id}/alignment")
async def update_alignment(
    scene_id: str,
    body: dict[str, object],
) -> dict[str, str]:
    """Apply a user alignment transform to the scene."""
    return {"status": "stub"}


@router.put("/scene/{scene_id}/crop")
async def update_crop(
    scene_id: str,
    body: dict[str, object],
) -> dict[str, str]:
    """Apply a crop bounding box to the scene."""
    return {"status": "stub"}


@router.put("/scene/{scene_id}/scale")
async def update_scale(
    scene_id: str,
    body: dict[str, object],
) -> dict[str, str]:
    """Apply a metric scale correction to the scene."""
    return {"status": "stub"}
