"""Extract GoPro Metadata Format (GPMF) telemetry from video files."""

from __future__ import annotations

from pathlib import Path

from server.models import FrameMetadata


async def extract_gpmf(video_path: Path) -> list[FrameMetadata]:
    """Parse GPMF telemetry stream from a GoPro video."""
    return []
