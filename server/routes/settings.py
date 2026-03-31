"""Application settings routes."""

from __future__ import annotations

from fastapi import APIRouter

from server.config import settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings() -> dict[str, object]:
    """Return the current application settings."""
    profile = settings.load_hardware_profile()
    return {
        "app_version": settings.app_version,
        "host": settings.host,
        "port": settings.port,
        "scenes_dir": str(settings.scenes_path),
        "hardware_profile": profile.model_dump(),
    }


@router.put("")
async def update_settings(body: dict[str, object]) -> dict[str, str]:
    """Update application settings (currently read-only)."""
    return {"status": "settings are read-only in v4"}
