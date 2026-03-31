"""Parse DJI SRT subtitle files for telemetry data."""

from __future__ import annotations

import math
import re
from pathlib import Path

from server.models import FrameMetadata, GPSCoordinate

# Regex patterns for DJI SRT fields
_RE_LATITUDE = re.compile(r"\[latitude:\s*([-\d.]+)\]")
_RE_LONGITUDE = re.compile(r"\[longitude:\s*([-\d.]+)\]")
_RE_REL_ALT = re.compile(r"\[rel_alt:\s*([-\d.]+)\]")
_RE_ABS_ALT = re.compile(r"\[abs_alt:\s*([-\d.]+)\]")
_RE_GB_YAW = re.compile(r"\[gb_yaw:\s*([-\d.]+)\]")
_RE_GB_PITCH = re.compile(r"\[gb_pitch:\s*([-\d.]+)\]")
_RE_GB_ROLL = re.compile(r"\[gb_roll:\s*([-\d.]+)\]")
_RE_ISO = re.compile(r"\[iso:\s*(\d+)\]")
_RE_SHUTTER = re.compile(r"\[shutter:\s*([\d/.]+)\]")
_RE_CT = re.compile(r"\[ct:\s*(\d+)\]")
_RE_TIMESTAMP = re.compile(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})")


def parse_srt(srt_path: Path) -> list[FrameMetadata]:
    """Parse a DJI SRT file and extract per-frame GPS and attitude data."""
    content = srt_path.read_text(encoding="utf-8", errors="replace")

    # Split into subtitle blocks (separated by blank lines)
    blocks = re.split(r"\n\s*\n", content.strip())

    frames: list[FrameMetadata] = []
    frame_index = 0

    for block in blocks:
        if not block.strip():
            continue

        lines = block.strip().split("\n")
        if len(lines) < 2:
            continue

        # Parse timestamp from the timecode line
        timestamp_ms = 0.0
        for line in lines:
            ts_match = _RE_TIMESTAMP.search(line)
            if ts_match:
                h, m, s, ms = ts_match.groups()
                timestamp_ms = (
                    int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(ms)
                )
                break

        # Join all lines to search for metadata
        text = " ".join(lines)

        # GPS
        gps = None
        lat_match = _RE_LATITUDE.search(text)
        lon_match = _RE_LONGITUDE.search(text)
        if lat_match and lon_match:
            lat = float(lat_match.group(1))
            lon = float(lon_match.group(1))
            alt = None
            alt_match = _RE_REL_ALT.search(text) or _RE_ABS_ALT.search(text)
            if alt_match:
                alt = float(alt_match.group(1))
            gps = GPSCoordinate(latitude=lat, longitude=lon, altitude=alt)

        # Gimbal angles
        quaternion = None
        gravity_vector = None
        yaw_match = _RE_GB_YAW.search(text)
        pitch_match = _RE_GB_PITCH.search(text)
        roll_match = _RE_GB_ROLL.search(text)

        if pitch_match and roll_match:
            pitch_deg = float(pitch_match.group(1))
            roll_deg = float(roll_match.group(1))
            yaw_deg = float(yaw_match.group(1)) if yaw_match else 0.0

            # Convert gimbal angles to gravity vector
            gravity_vector = _gimbal_to_gravity(pitch_deg, roll_deg)

            # Convert Euler angles to quaternion (ZYX convention)
            quaternion = _euler_to_quaternion(yaw_deg, pitch_deg, roll_deg)

        # Camera settings
        iso = None
        iso_match = _RE_ISO.search(text)
        if iso_match:
            iso = int(iso_match.group(1))

        shutter = None
        shutter_match = _RE_SHUTTER.search(text)
        if shutter_match:
            shutter = shutter_match.group(1)

        white_balance = None
        ct_match = _RE_CT.search(text)
        if ct_match:
            white_balance = int(ct_match.group(1))

        # Only add if we have meaningful data
        if gps or quaternion or iso:
            frames.append(FrameMetadata(
                frame_index=frame_index,
                timestamp_ms=timestamp_ms,
                quaternion=quaternion,
                gravity_vector=gravity_vector,
                gps=gps,
                iso=iso,
                shutter_speed=shutter,
                white_balance=white_balance,
            ))

        frame_index += 1

    return frames


def _gimbal_to_gravity(pitch_deg: float, roll_deg: float) -> list[float]:
    """Derive gravity vector from gimbal pitch and roll angles."""
    pitch = math.radians(pitch_deg)
    roll = math.radians(roll_deg)

    # Gravity in camera frame derived from gimbal orientation
    gx = -math.sin(roll)
    gy = math.sin(pitch) * math.cos(roll)
    gz = math.cos(pitch) * math.cos(roll)

    return [gx, gy, gz]


def _euler_to_quaternion(
    yaw_deg: float, pitch_deg: float, roll_deg: float,
) -> list[float]:
    """Convert Euler angles (ZYX convention) to quaternion [w, x, y, z]."""
    yaw = math.radians(yaw_deg) / 2
    pitch = math.radians(pitch_deg) / 2
    roll = math.radians(roll_deg) / 2

    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cr, sr = math.cos(roll), math.sin(roll)

    w = cy * cp * cr + sy * sp * sr
    x = cy * cp * sr - sy * sp * cr
    y = cy * sp * cr + sy * cp * sr
    z = sy * cp * cr - cy * sp * sr

    return [w, x, y, z]
