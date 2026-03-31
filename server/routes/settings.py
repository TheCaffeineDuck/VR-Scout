"""Application settings routes."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings() -> dict[str, object]:
    """Return the current application settings."""
    return {}


@router.put("")
async def update_settings(body: dict[str, object]) -> dict[str, str]:
    """Update application settings."""
    return {"status": "stub"}
