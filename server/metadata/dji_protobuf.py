"""Extract metadata from DJI videos using embedded protobuf streams."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from server.models import FrameMetadata, GPSCoordinate

logger = logging.getLogger(__name__)


async def extract_dji_protobuf(video_path: Path) -> list[FrameMetadata]:
    """Parse DJI protobuf telemetry embedded in the video container.

    Uses exiftool with -ee flag to extract embedded timed metadata.
    Without -ee, DJI Pocket 3 protobuf tracks (djmd format) are invisible.
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
    stdout_bytes, stderr_bytes = await proc.communicate()

    if proc.returncode != 0:
        logger.debug("exiftool -ee failed: %s", stderr_bytes.decode(errors="replace"))
        return []

    try:
        data = json.loads(stdout_bytes.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        logger.debug("Failed to parse exiftool JSON output")
        return []

    if not data or not isinstance(data, list):
        return []

    entries = data[0] if isinstance(data[0], dict) else {}

    frames: list[FrameMetadata] = []
    frame_index = 0

    # Look for DJI-specific timed metadata keys
    # DJI embeds telemetry in Doc3 group with keys like:
    # Doc3:QuaternionW, Doc3:AccelerometerX, etc.
    for key, value in entries.items():
        # Detect DJI telemetry keys
        if "QuaternionW" in key or "GimbalYaw" in key:
            # Found DJI telemetry — parse all quaternion/accel/GPS data
            qw = _get_float(entries, "QuaternionW")
            qx = _get_float(entries, "QuaternionX")
            qy = _get_float(entries, "QuaternionY")
            qz = _get_float(entries, "QuaternionZ")

            quaternion: list[float] | None = None
            if qw is not None and qx is not None and qy is not None and qz is not None:
                quaternion = [qw, qx, qy, qz]

            ax = _get_float(entries, "AccelerometerX")
            ay = _get_float(entries, "AccelerometerY")
            az = _get_float(entries, "AccelerometerZ")

            accelerometer: list[float] | None = None
            gravity_vector: list[float] | None = None
            if ax is not None and ay is not None and az is not None:
                accelerometer = [ax, ay, az]
                import math

                mag = math.sqrt(ax * ax + ay * ay + az * az)
                if mag > 0:
                    gravity_vector = [ax / mag, ay / mag, az / mag]

            # GPS
            gps = None
            lat = _get_float(entries, "GPSLatitude")
            lon = _get_float(entries, "GPSLongitude")
            if lat is not None and lon is not None:
                alt = _get_float(entries, "GPSAltitude")
                gps = GPSCoordinate(latitude=lat, longitude=lon, altitude=alt)

            # Camera settings
            iso = _get_int(entries, "ISO")
            shutter = _get_str(entries, "ShutterSpeed") or _get_str(entries, "ExposureTime")
            wb = _get_int(entries, "WhiteBalance") or _get_int(entries, "ColorTemperature")

            frames.append(FrameMetadata(
                frame_index=frame_index,
                quaternion=quaternion,
                gravity_vector=gravity_vector,
                accelerometer=accelerometer,
                gps=gps,
                iso=iso,
                shutter_speed=shutter,
                white_balance=wb,
            ))
            frame_index += 1
            break  # Single-entry extraction for now

    # Also try parsing per-sample timed metadata from Doc groups
    for i in range(1, 10000):
        prefix = f"Doc{i}:"
        found = False
        for key in entries:
            if key.startswith(prefix):
                found = True
                break
        if not found:
            break

        qw = _get_float_prefixed(entries, prefix, "QuaternionW")
        qx = _get_float_prefixed(entries, prefix, "QuaternionX")
        qy = _get_float_prefixed(entries, prefix, "QuaternionY")
        qz = _get_float_prefixed(entries, prefix, "QuaternionZ")

        doc_quat: list[float] | None = None
        if qw is not None and qx is not None and qy is not None and qz is not None:
            doc_quat = [qw, qx, qy, qz]

        ax = _get_float_prefixed(entries, prefix, "AccelerometerX")
        ay = _get_float_prefixed(entries, prefix, "AccelerometerY")
        az = _get_float_prefixed(entries, prefix, "AccelerometerZ")

        doc_accel: list[float] | None = None
        doc_gravity: list[float] | None = None
        if ax is not None and ay is not None and az is not None:
            doc_accel = [ax, ay, az]
            import math

            mag = math.sqrt(ax * ax + ay * ay + az * az)
            if mag > 0:
                doc_gravity = [ax / mag, ay / mag, az / mag]

        gps = None
        lat = _get_float_prefixed(entries, prefix, "GPSLatitude")
        lon = _get_float_prefixed(entries, prefix, "GPSLongitude")
        if lat is not None and lon is not None:
            alt = _get_float_prefixed(entries, prefix, "GPSAltitude")
            gps = GPSCoordinate(latitude=lat, longitude=lon, altitude=alt)

        if doc_quat or doc_accel or gps:
            frames.append(FrameMetadata(
                frame_index=frame_index,
                quaternion=doc_quat,
                gravity_vector=doc_gravity,
                accelerometer=doc_accel,
                gps=gps,
            ))
            frame_index += 1

    return frames


def _get_float(d: dict[str, object], partial_key: str) -> float | None:
    """Find a float value by partial key match."""
    for k, v in d.items():
        if partial_key in k:
            try:
                return float(str(v).split()[0])
            except (ValueError, IndexError):
                return None
    return None


def _get_float_prefixed(d: dict[str, object], prefix: str, key: str) -> float | None:
    """Get a float value with exact prefix."""
    full_key = f"{prefix}{key}"
    v = d.get(full_key)
    if v is None:
        return None
    try:
        return float(str(v).split()[0])
    except (ValueError, IndexError):
        return None


def _get_int(d: dict[str, object], partial_key: str) -> int | None:
    """Find an integer value by partial key match."""
    for k, v in d.items():
        if partial_key in k:
            try:
                return int(float(str(v).split()[0]))
            except (ValueError, IndexError):
                return None
    return None


def _get_str(d: dict[str, object], partial_key: str) -> str | None:
    """Find a string value by partial key match."""
    for k, v in d.items():
        if partial_key in k:
            return str(v)
    return None
