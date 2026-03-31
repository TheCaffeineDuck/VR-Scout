"""Extract Apple CoreMotion data from iPhone and iPad videos."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from server.models import FrameMetadata, GPSCoordinate

logger = logging.getLogger(__name__)


async def extract_apple_motion(video_path: Path) -> list[FrameMetadata]:
    """Parse Apple CoreMotion and ARKit metadata from a QuickTime file.

    Uses exiftool to read Apple-specific motion metadata from MOV/MP4.
    """
    cmd = [
        "exiftool", "-G3", "-api", "largefilesupport=1",
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

    # Check for Apple-specific keys
    is_apple = any(
        "Apple" in str(v) or "iPhone" in str(v) or "iPad" in str(v)
        for k, v in entries.items()
        if "Make" in k or "Model" in k or "Software" in k
    )
    if not is_apple:
        return []

    frames: list[FrameMetadata] = []

    # Extract GPS
    gps = None
    lat = _safe_float(entries, "GPSLatitude")
    lon = _safe_float(entries, "GPSLongitude")
    if lat is not None and lon is not None:
        alt = _safe_float(entries, "GPSAltitude")
        gps = GPSCoordinate(latitude=lat, longitude=lon, altitude=alt)

    iso = _safe_int(entries, "ISO")
    shutter = _safe_str(entries, "ExposureTime")

    if gps or iso:
        frames.append(FrameMetadata(
            frame_index=0,
            gps=gps,
            iso=iso,
            shutter_speed=shutter,
        ))

    return frames


def _safe_float(d: dict[str, object], partial_key: str) -> float | None:
    for k, v in d.items():
        if partial_key in k:
            try:
                return float(str(v).split()[0])
            except (ValueError, IndexError):
                return None
    return None


def _safe_int(d: dict[str, object], partial_key: str) -> int | None:
    for k, v in d.items():
        if partial_key in k:
            try:
                return int(float(str(v).split()[0]))
            except (ValueError, IndexError):
                return None
    return None


def _safe_str(d: dict[str, object], partial_key: str) -> str | None:
    for k, v in d.items():
        if partial_key in k:
            return str(v)
    return None
