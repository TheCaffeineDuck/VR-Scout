"""Extract EXIF orientation and GPS data from image files."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from server.models import FrameMetadata, GPSCoordinate

logger = logging.getLogger(__name__)


async def extract_exif_orientation(video_path: Path) -> list[FrameMetadata]:
    """Read EXIF tags for orientation, GPS, and camera settings.

    Uses exiftool on the video file to get basic orientation data.
    """
    cmd = [
        "exiftool", "-json",
        "-Orientation", "-GPSLatitude", "-GPSLongitude", "-GPSAltitude",
        "-ISO", "-ExposureTime", "-WhiteBalance",
        "-Rotation",
        str(video_path),
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
    if not entries:
        return []

    # GPS
    gps = None
    lat = _safe_float(entries, "GPSLatitude")
    lon = _safe_float(entries, "GPSLongitude")
    if lat is not None and lon is not None:
        alt = _safe_float(entries, "GPSAltitude")
        gps = GPSCoordinate(latitude=lat, longitude=lon, altitude=alt)

    iso = _safe_int(entries, "ISO")
    shutter = _safe_str(entries, "ExposureTime")
    wb = _safe_int(entries, "WhiteBalance")

    # Only return if we found something useful
    if not gps and not iso:
        return []

    return [FrameMetadata(
        frame_index=0,
        gps=gps,
        iso=iso,
        shutter_speed=shutter,
        white_balance=wb,
    )]


def _safe_float(d: dict[str, object], key: str) -> float | None:
    v = d.get(key)
    if v is None:
        return None
    try:
        return float(str(v).split()[0])
    except (ValueError, IndexError):
        return None


def _safe_int(d: dict[str, object], key: str) -> int | None:
    v = d.get(key)
    if v is None:
        return None
    try:
        return int(float(str(v).split()[0]))
    except (ValueError, IndexError):
        return None


def _safe_str(d: dict[str, object], key: str) -> str | None:
    v = d.get(key)
    if v is None:
        return None
    return str(v)
