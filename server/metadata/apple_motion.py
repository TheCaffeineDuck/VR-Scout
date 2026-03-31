"""Extract Apple CoreMotion data from iPhone and iPad videos."""

from __future__ import annotations

from pathlib import Path

from server.models import FrameMetadata


async def extract_apple_motion(video_path: Path) -> list[FrameMetadata]:
    """Parse Apple CoreMotion and ARKit metadata from a QuickTime file."""
    return []
