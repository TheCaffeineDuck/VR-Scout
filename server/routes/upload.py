"""Upload routes for chunked video and supplementary file ingestion."""

from __future__ import annotations

from fastapi import APIRouter, UploadFile

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post("/chunk")
async def upload_chunk(file: UploadFile) -> dict[str, str]:
    """Receive a single chunk of a large video upload."""
    return {"status": "stub"}


@router.post("/supplementary/{scene_id}")
async def upload_supplementary(
    scene_id: str,
    file: UploadFile,
) -> dict[str, str]:
    """Upload a supplementary file (SRT, panorama, etc.) for a scene."""
    return {"status": "stub"}
