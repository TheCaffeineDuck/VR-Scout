"""Geo-spatial utilities for GPS/gimbal telemetry conversion.

Converts GPS coordinates to local ENU (East-North-Up) for COLMAP
geo-registration, and derives gravity priors from gimbal orientation.

No external dependencies beyond the Python stdlib.
"""

import math
import statistics
from pathlib import Path


def gps_to_enu(
    lat: float,
    lon: float,
    alt: float,
    ref_lat: float,
    ref_lon: float,
    ref_alt: float,
) -> tuple[float, float, float]:
    """Convert GPS (lat, lon, alt) to local ENU coordinates.

    Uses a flat-earth approximation valid within ~10km:
      East  = (lon - ref_lon) * cos(ref_lat) * 111320
      North = (lat - ref_lat) * 111320
      Up    = alt - ref_alt

    Args:
        lat: Latitude in decimal degrees.
        lon: Longitude in decimal degrees.
        alt: Altitude in meters (above sea level).
        ref_lat: Reference latitude (local origin).
        ref_lon: Reference longitude (local origin).
        ref_alt: Reference altitude (local origin).

    Returns:
        (east, north, up) in meters.
    """
    lat_r = math.radians(ref_lat)
    east = (lon - ref_lon) * math.cos(lat_r) * 111320.0
    north = (lat - ref_lat) * 111320.0
    up = alt - ref_alt
    return east, north, up


def generate_geo_registration_file(
    matched_frames: dict,
    output_path: str,
) -> int:
    """Write a COLMAP-compatible geo-registration reference file.

    Uses the first frame's GPS position as the local origin.
    Coordinate convention: X=East, Y=North, Z=Up.

    File format (space-separated, one line per image):
        image_name X Y Z

    Only includes frames that have GPS data.
    Skips frames with GPS (0,0) — treated as no-fix.

    Args:
        matched_frames: Output from match_srt_to_frames().
        output_path: Path to write the geo-reference text file.

    Returns:
        Number of frames written to the file.
    """
    frames = matched_frames.get("matched_frames", [])

    # Collect frames with valid GPS
    gps_frames: list[dict] = []
    for f in frames:
        gps = f.get("gps")
        if gps is None:
            continue
        lat = gps.get("latitude", 0.0)
        lon = gps.get("longitude", 0.0)
        if abs(lat) < 0.0001 and abs(lon) < 0.0001:
            continue  # No-fix sentinel
        gps_frames.append(f)

    if not gps_frames:
        return 0

    # Use first valid GPS as reference origin
    ref_gps = gps_frames[0]["gps"]
    ref_lat = ref_gps["latitude"]
    ref_lon = ref_gps["longitude"]
    # Use abs_altitude if available, fall back to rel_altitude, then 0
    ref_alt = ref_gps.get("abs_altitude") or ref_gps.get("rel_altitude") or 0.0

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    with open(out, "w") as fh:
        for f in gps_frames:
            gps = f["gps"]
            lat = gps["latitude"]
            lon = gps["longitude"]
            alt = gps.get("abs_altitude") or gps.get("rel_altitude") or 0.0

            e, n, u = gps_to_enu(lat, lon, alt, ref_lat, ref_lon, ref_alt)
            frame_file = f["frame_file"]
            fh.write(f"{frame_file} {e:.6f} {n:.6f} {u:.6f}\n")
            written += 1

    return written


def generate_gravity_prior(matched_frames: dict) -> dict:
    """Derive a gravity direction from gimbal orientation data.

    DJI gimbal conventions:
      pitch: -90 = straight down, 0 = horizon, +90 = straight up
      roll:  deviation from level (near 0 for stabilized footage)

    The gimbal reports its orientation relative to gravity via internal IMU.
    A pitch of 0 and roll of 0 means the camera is level — gravity is along
    the camera's -Y axis in image space (landscape orientation).

    Returns:
        Dict with gravity_vector, confidence, stats, and method.
    """
    frames = matched_frames.get("matched_frames", [])

    pitches: list[float] = []
    rolls: list[float] = []

    for f in frames:
        gimbal = f.get("gimbal")
        if gimbal is None:
            continue
        pitches.append(gimbal["pitch"])
        rolls.append(gimbal["roll"])

    if not pitches:
        return {
            "gravity_vector": [0.0, -1.0, 0.0],
            "confidence": "low",
            "median_pitch": None,
            "median_roll": None,
            "pitch_stddev": None,
            "roll_stddev": None,
            "method": "default_assumption",
        }

    median_pitch = statistics.median(pitches)
    median_roll = statistics.median(rolls)
    pitch_stddev = statistics.stdev(pitches) if len(pitches) > 1 else 0.0
    roll_stddev = statistics.stdev(rolls) if len(rolls) > 1 else 0.0

    # Derive gravity vector from median gimbal orientation.
    # In camera-local frame (landscape, Y-down convention):
    #   pitch rotates around camera X axis
    #   roll rotates around camera Z axis
    # Gravity in camera frame when level (pitch=0, roll=0) is [0, -1, 0].
    pitch_rad = math.radians(median_pitch)
    roll_rad = math.radians(median_roll)

    # Gravity rotated by pitch (around X) then roll (around Z)
    gx = math.sin(roll_rad) * math.cos(pitch_rad)
    gy = -(math.cos(roll_rad) * math.cos(pitch_rad))
    gz = math.sin(pitch_rad)

    # Normalize
    mag = math.sqrt(gx * gx + gy * gy + gz * gz)
    if mag > 0:
        gx /= mag
        gy /= mag
        gz /= mag

    # Determine confidence
    abs_median_roll = abs(median_roll)
    if abs_median_roll < 2.0 and pitch_stddev < 30.0:
        confidence = "high"
    elif abs_median_roll < 5.0 and pitch_stddev < 60.0:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "gravity_vector": [round(gx, 6), round(gy, 6), round(gz, 6)],
        "confidence": confidence,
        "median_pitch": round(median_pitch, 1),
        "median_roll": round(median_roll, 1),
        "pitch_stddev": round(pitch_stddev, 1),
        "roll_stddev": round(roll_stddev, 1),
        "method": "gimbal_imu",
    }
