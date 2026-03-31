"""Extract Camera Motion Metadata (CAMM) from MP4 tracks."""

from __future__ import annotations

from pathlib import Path

from server.models import FrameMetadata


async def extract_camm(video_path: Path) -> list[FrameMetadata]:
    """Parse CAMM motion metadata track from an MP4 file."""
    return []
