"""Extract Camera Motion Metadata (CAMM) from MP4 tracks."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from server.models import FrameMetadata, GPSCoordinate

logger = logging.getLogger(__name__)


async def extract_camm(video_path: Path) -> list[FrameMetadata]:
    """Parse CAMM motion metadata track from an MP4 file.

    Uses exiftool -ee to extract embedded CAMM data.
    """
    # First check if the video has a CAMM track
    probe_cmd = [
        "ffprobe", "-v", "quiet", "-show_streams",
        "-print_format", "json", str(video_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *probe_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, _ = await proc.communicate()

    try:
        probe_data = json.loads(stdout_bytes.decode("utf-8", errors="replace"))
        streams = probe_data.get("streams", [])
        has_camm = any(
            s.get("codec_tag_string", "") == "camm" or "camm" in s.get("codec_name", "").lower()
            for s in streams
        )
        if not has_camm:
            return []
    except (json.JSONDecodeError, KeyError):
        return []

    # Extract with exiftool
    cmd = [
        "exiftool", "-ee", "-G3", "-api", "largefilesupport=1",
        "-json", str(video_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, _ = await proc.communicate()

    if proc.returncode != 0:
        return []

    try:
        data = json.loads(stdout_bytes.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return []

    if not data or not isinstance(data, list):
        return []

    entries = data[0] if isinstance(data[0], dict) else {}
    frames: list[FrameMetadata] = []

    # Look for CAMM-specific fields
    for key, value in entries.items():
        if "AngularVelocity" in key or "Acceleration" in key or "GPSLatitude" in key:
            gps = None
            lat = _safe_float(entries, "GPSLatitude")
            lon = _safe_float(entries, "GPSLongitude")
            if lat is not None and lon is not None:
                alt = _safe_float(entries, "GPSAltitude")
                gps = GPSCoordinate(latitude=lat, longitude=lon, altitude=alt)

            frames.append(FrameMetadata(
                frame_index=len(frames),
                gps=gps,
            ))
            break

    return frames


def _safe_float(d: dict[str, object], partial_key: str) -> float | None:
    for k, v in d.items():
        if partial_key in k:
            try:
                return float(str(v).split()[0])
            except (ValueError, IndexError):
                return None
    return None
