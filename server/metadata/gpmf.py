"""Extract GoPro Metadata Format (GPMF) telemetry from video files."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from server.models import FrameMetadata, GPSCoordinate

logger = logging.getLogger(__name__)


async def extract_gpmf(video_path: Path) -> list[FrameMetadata]:
    """Parse GPMF telemetry stream from a GoPro video.

    Uses exiftool -ee to extract GoPro-specific metadata tags.
    """
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

    # Check for GoPro-specific keys
    is_gopro = any(
        "GoPro" in k or "GPMF" in k or "DeviceName" in k
        for k in entries
    )
    if not is_gopro:
        return []

    frames: list[FrameMetadata] = []

    # Extract GPS if available
    gps = None
    lat = _safe_float(entries, "GPSLatitude")
    lon = _safe_float(entries, "GPSLongitude")
    if lat is not None and lon is not None:
        alt = _safe_float(entries, "GPSAltitude")
        gps = GPSCoordinate(latitude=lat, longitude=lon, altitude=alt)

    # Extract accelerometer
    accel: list[float] | None = None
    ax = _safe_float(entries, "AccelerometerX")
    ay = _safe_float(entries, "AccelerometerY")
    az = _safe_float(entries, "AccelerometerZ")
    if ax is not None and ay is not None and az is not None:
        accel = [ax, ay, az]

    iso = _safe_int(entries, "ISO")

    if gps or accel or iso:
        frames.append(FrameMetadata(
            frame_index=0,
            gps=gps,
            accelerometer=accel,
            iso=iso,
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
