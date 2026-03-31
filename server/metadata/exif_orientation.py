"""Extract EXIF orientation and GPS data from image files."""

from __future__ import annotations

from pathlib import Path

from server.models import FrameMetadata


async def extract_exif_orientation(video_path: Path) -> list[FrameMetadata]:
    """Read EXIF tags for orientation, GPS, and camera settings."""
    return []
