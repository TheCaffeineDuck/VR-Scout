"""Health check endpoint."""

from fastapi import APIRouter

from ..config import settings

router = APIRouter()


@router.get("/api/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "version": settings.app_version}
