"""Scene management routes."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from server import database as db
from server.config import settings
from server.models import SceneConfig, SceneCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["scenes"])


@router.post("/scenes")
async def create_scene(body: SceneCreate) -> dict[str, str]:
    """Create a new scene and its directory tree."""
    scene_id = await db.create_scene(body.name)

    # Create directory structure
    scene_dir = settings.scenes_path / scene_id
    for subdir in ["raw", "frames", "logs", "metadata", "output",
                    "sparse", "aligned", "supplementary", "panoramas"]:
        (scene_dir / subdir).mkdir(parents=True, exist_ok=True)

    return {"status": "created", "scene_id": scene_id}


@router.get("/scenes")
async def list_scenes() -> list[dict[str, object]]:
    """Return all scenes with their latest status."""
    scenes = await db.list_scenes()
    result = []
    for scene in scenes:
        scene_id = str(scene["id"])
        scene_dir = settings.scenes_path / scene_id

        # Infer status from directory state
        status = "pending"
        if (scene_dir / "output" / "scene_desktop.spz").exists():
            status = "completed"
        elif (scene_dir / "aligned").exists() and any((scene_dir / "aligned").iterdir()):
            status = "aligned"
        elif (scene_dir / "sparse").exists() and any((scene_dir / "sparse").iterdir()):
            status = "mapped"
        elif (scene_dir / "frames").exists() and any((scene_dir / "frames").iterdir()):
            status = "extracted"
        elif (scene_dir / "raw").exists() and any((scene_dir / "raw").iterdir()):
            status = "uploaded"

        latest_run = await db.get_latest_run(scene_id)

        result.append({
            "id": scene_id,
            "name": scene["name"],
            "created_at": scene["created_at"],
            "status": status,
            "pipeline_status": str(latest_run["status"]) if latest_run else None,
        })

    return result


@router.get("/scene/{scene_id}/config")
async def get_scene_config(scene_id: str) -> SceneConfig:
    """Return the full configuration for a single scene."""
    scene = await db.get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    scene_dir = settings.scenes_path / scene_id
    output_dir = scene_dir / "output"

    # Build asset URLs
    desktop_spz = ""
    quest_spz = ""
    alignment_url = ""

    if (output_dir / "scene_desktop.spz").exists():
        desktop_spz = f"/api/scene/{scene_id}/asset/scene_desktop.spz"
    if (output_dir / "scene_quest.spz").exists():
        quest_spz = f"/api/scene/{scene_id}/asset/scene_quest.spz"
    if (output_dir / "alignment.json").exists():
        alignment_url = f"/api/scene/{scene_id}/asset/alignment.json"

    collision_mesh_url = None
    if (output_dir / "collision_mesh.glb").exists():
        collision_mesh_url = f"/api/scene/{scene_id}/asset/collision_mesh.glb"

    flythrough_url = None
    if (output_dir / "flythrough.mp4").exists():
        flythrough_url = f"/api/scene/{scene_id}/asset/flythrough.mp4"

    return SceneConfig(
        id=scene_id,
        name=str(scene["name"]),
        desktop_spz_url=desktop_spz,
        quest_spz_url=quest_spz,
        alignment_url=alignment_url,
        collision_mesh_url=collision_mesh_url,
        flythrough_video_url=flythrough_url,
    )


@router.get("/scene/{scene_id}/asset/{filename}")
async def get_asset(scene_id: str, filename: str) -> FileResponse:
    """Serve a scene asset file."""
    asset_path = settings.scenes_path / scene_id / "output" / filename
    if not asset_path.exists():
        raise HTTPException(status_code=404, detail=f"Asset {filename} not found")
    return FileResponse(path=str(asset_path))


@router.get("/scene/{scene_id}/cameras")
async def get_cameras(scene_id: str) -> dict[str, object]:
    """Return extracted camera poses for a scene."""
    aligned_dir = settings.scenes_path / scene_id / "aligned"
    if not aligned_dir.exists():
        return {"scene_id": scene_id, "cameras": []}

    # Basic camera data — full COLMAP binary parsing is complex
    # Return empty list for now, can be enhanced with pycolmap later
    return {"scene_id": scene_id, "cameras": []}


@router.get("/scene/{scene_id}/mesh")
async def get_mesh(scene_id: str) -> FileResponse:
    """Serve the collision mesh file for a scene."""
    mesh_path = settings.scenes_path / scene_id / "output" / "collision_mesh.glb"
    if not mesh_path.exists():
        raise HTTPException(status_code=404, detail="Collision mesh not found")
    return FileResponse(path=str(mesh_path))


@router.get("/scene/{scene_id}/video")
async def get_video(scene_id: str) -> FileResponse:
    """Serve the fly-through preview video for a scene."""
    video_path = settings.scenes_path / scene_id / "output" / "flythrough.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Flythrough video not found")
    return FileResponse(path=str(video_path))


@router.put("/scene/{scene_id}/alignment")
async def update_alignment(
    scene_id: str,
    body: dict[str, object],
) -> dict[str, str]:
    """Apply a user alignment transform to the scene."""
    scene_dir = settings.scenes_path / scene_id
    if not scene_dir.exists():
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    alignment_path = scene_dir / "user_alignment.json"
    alignment_path.write_text(json.dumps(body, indent=2, default=str), encoding="utf-8")

    return {"status": "updated"}


@router.put("/scene/{scene_id}/crop")
async def update_crop(
    scene_id: str,
    body: dict[str, object],
) -> dict[str, str]:
    """Apply a crop bounding box to the scene."""
    scene_dir = settings.scenes_path / scene_id
    if not scene_dir.exists():
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    crop_path = scene_dir / "crop_bounds.json"
    crop_path.write_text(json.dumps(body, indent=2, default=str), encoding="utf-8")

    return {"status": "updated"}


@router.put("/scene/{scene_id}/scale")
async def update_scale(
    scene_id: str,
    body: dict[str, object],
) -> dict[str, str]:
    """Apply a metric scale correction to the scene."""
    scene_dir = settings.scenes_path / scene_id
    if not scene_dir.exists():
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    scale_path = scene_dir / "scale_params.json"
    scale_path.write_text(json.dumps(body, indent=2, default=str), encoding="utf-8")

    return {"status": "updated"}
