"""Parse DJI SRT subtitle files for telemetry data."""

from __future__ import annotations

from pathlib import Path

from server.models import FrameMetadata


def parse_srt(srt_path: Path) -> list[FrameMetadata]:
    """Parse a DJI SRT file and extract per-frame GPS and attitude data."""
    return []
