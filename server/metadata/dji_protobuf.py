"""Extract metadata from DJI videos using embedded protobuf streams."""

from __future__ import annotations

from pathlib import Path

from server.models import FrameMetadata


async def extract_dji_protobuf(video_path: Path) -> list[FrameMetadata]:
    """Parse DJI protobuf telemetry embedded in the video container."""
    return []
