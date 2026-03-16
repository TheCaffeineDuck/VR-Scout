"""Video metadata extraction and DJI SRT sidecar parsing.

Extracts camera metadata from video containers via ffprobe,
parses DJI SRT telemetry files, and matches SRT entries to
extracted frames by timestamp.

No external dependencies beyond the Python stdlib + asyncio.
"""

import asyncio
import bisect
import json
import logging
import re
import statistics
from pathlib import Path

logger = logging.getLogger(__name__)

# ── ISO 6709 GPS string parser ──────────────────────────────────
# Format: +DD.DDDD+DDD.DDDD+AAA.AAA/ or +DD.DDDD-DDD.DDDD/
_ISO6709_RE = re.compile(
    r"(?P<lat>[+-][\d.]+)"
    r"(?P<lon>[+-][\d.]+)"
    r"(?:(?P<alt>[+-][\d.]+))?"
    r"/?"
)


def _parse_iso6709(location: str) -> dict | None:
    """Parse ISO 6709 GPS string into lat/lon/alt dict, or None."""
    m = _ISO6709_RE.match(location.strip())
    if not m:
        return None
    lat = float(m.group("lat"))
    lon = float(m.group("lon"))
    alt = float(m.group("alt")) if m.group("alt") else None
    if abs(lat) < 0.0001 and abs(lon) < 0.0001:
        return None  # GPS (0,0) means no fix
    return {"latitude": lat, "longitude": lon, "altitude": alt}


# ── DJI SRT regex patterns ──────────────────────────────────────
# Tolerant of spacing around colons and varying decimal formats
_SRT_PATTERNS = {
    "latitude": re.compile(r"\[latitude\s*:\s*([-\d.]+)\]"),
    "longitude": re.compile(r"\[longitude\s*:\s*([-\d.]+)\]"),
    "rel_alt": re.compile(r"\[rel_alt\s*:\s*([-\d.]+)"),
    "abs_alt": re.compile(r"\[abs_alt\s*:\s*([-\d.]+)"),
    "gb_yaw": re.compile(r"\[gb_yaw\s*:\s*([-\d.]+)"),
    "gb_pitch": re.compile(r"\[gb_pitch\s*:\s*([-\d.]+)"),
    "gb_roll": re.compile(r"\[gb_roll\s*:\s*([-\d.]+)"),
    "iso": re.compile(r"\[iso\s*:\s*(\d+)\]"),
    "shutter": re.compile(r"\[shutter\s*:\s*([\d/.]+)\]"),
    "fnum": re.compile(r"\[fnum\s*:\s*(\d+)\]"),
    "ev": re.compile(r"\[ev\s*:\s*([-\d.]+)\]"),
    "focal_len": re.compile(r"\[focal_len\s*:\s*(\d+)\]"),
    "dzoom_ratio": re.compile(r"\[dzoom_ratio\s*:\s*(\d+)"),
}

_TIMECODE_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
    r"\s*-->\s*"
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
)

_DATETIME_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.\d]*"
)

_FONT_TAG_RE = re.compile(r"</?font[^>]*>", re.IGNORECASE)


def _tc_to_ms(h: str, m: str, s: str, ms: str) -> int:
    return int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(ms)


# ── Public API ───────────────────────────────────────────────────


async def extract_video_metadata(video_path: str) -> dict:
    """Extract metadata from video container via ffprobe.

    Returns a dict with camera info, GPS, rotation, and raw ffprobe output.
    Uses asyncio.create_subprocess_exec (never shell=True).
    """
    result: dict = {
        "source": "container",
        "duration_seconds": None,
        "resolution": None,
        "fps": None,
        "codec": None,
        "creation_time": None,
        "rotation": 0,
        "camera_make": None,
        "camera_model": None,
        "gps": None,
        "has_gravity_metadata": False,
        "raw_metadata": {},
    }

    try:
        process = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(video_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=30.0
        )
    except FileNotFoundError:
        logger.warning("ffprobe not found, skipping metadata extraction")
        return result
    except TimeoutError:
        logger.warning("ffprobe timed out for %s", video_path)
        return result

    if process.returncode != 0:
        logger.warning(
            "ffprobe failed for %s (exit %d): %s",
            video_path,
            process.returncode,
            stderr.decode(errors="replace").strip(),
        )
        return result

    try:
        data = json.loads(stdout.decode(errors="replace"))
    except json.JSONDecodeError:
        logger.warning("ffprobe output is not valid JSON for %s", video_path)
        return result

    result["raw_metadata"] = data

    # Parse format-level metadata
    fmt = data.get("format", {})
    fmt_tags = fmt.get("tags", {})

    if "duration" in fmt:
        try:
            result["duration_seconds"] = round(float(fmt["duration"]), 2)
        except (ValueError, TypeError):
            pass

    # Creation time
    for key in ("creation_time", "com.apple.quicktime.creationdate"):
        val = fmt_tags.get(key)
        if val:
            result["creation_time"] = val
            break

    # Camera make/model (Apple QuickTime tags, also used by DJI)
    for key in ("com.apple.quicktime.make", "make", "manufacturer"):
        val = fmt_tags.get(key)
        if val:
            result["camera_make"] = val
            break

    for key in ("com.apple.quicktime.model", "model"):
        val = fmt_tags.get(key)
        if val:
            result["camera_model"] = val
            break

    # GPS from location tag (ISO 6709)
    location = fmt_tags.get("location", fmt_tags.get("com.apple.quicktime.location.ISO6709", ""))
    if location:
        gps = _parse_iso6709(location)
        if gps:
            result["gps"] = gps

    # DJI-specific tags
    for tag_key, tag_val in fmt_tags.items():
        if tag_key.startswith("com.dji"):
            result["has_gravity_metadata"] = True
            break

    # Parse video stream
    streams = data.get("streams", [])
    video_stream = next(
        (s for s in streams if s.get("codec_type") == "video"), None
    )
    if video_stream:
        result["codec"] = video_stream.get("codec_name")
        w = video_stream.get("width")
        h = video_stream.get("height")
        if w and h:
            result["resolution"] = {"width": w, "height": h}

        # FPS
        r_frame_rate = video_stream.get("r_frame_rate", "")
        if "/" in str(r_frame_rate):
            parts = str(r_frame_rate).split("/")
            try:
                num, den = int(parts[0]), int(parts[1])
                if den:
                    result["fps"] = round(num / den, 2)
            except (ValueError, ZeroDivisionError):
                pass
        elif r_frame_rate:
            try:
                result["fps"] = float(r_frame_rate)
            except ValueError:
                pass

        # Rotation from tags or side_data_list
        stream_tags = video_stream.get("tags", {})
        rotate = stream_tags.get("rotate")
        if rotate:
            try:
                result["rotation"] = int(rotate)
            except ValueError:
                pass

        for sd in video_stream.get("side_data_list", []):
            if sd.get("side_data_type") == "Display Matrix":
                rot = sd.get("rotation")
                if rot is not None:
                    try:
                        result["rotation"] = int(rot)
                    except (ValueError, TypeError):
                        pass

    return result


def parse_dji_srt(srt_path: str) -> dict:
    """Parse a DJI SRT subtitle file into structured telemetry data.

    Returns a dict with entries list, summary flags, and bounds.
    Handles BOM, spacing variations, and missing fields gracefully.
    """
    path = Path(srt_path)
    raw = path.read_bytes()

    # Strip BOM if present
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]

    text = raw.decode("utf-8", errors="replace")

    # Split into subtitle blocks by double-newline
    blocks = re.split(r"\n\s*\n", text.strip())

    entries: list[dict] = []

    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 2:
            continue

        # Line 1: subtitle index
        try:
            index = int(lines[0].strip())
        except ValueError:
            continue

        # Line 2: timecode range
        tc_match = _TIMECODE_RE.search(lines[1])
        if not tc_match:
            continue

        g = tc_match.groups()
        start_ms = _tc_to_ms(g[0], g[1], g[2], g[3])
        end_ms = _tc_to_ms(g[4], g[5], g[6], g[7])

        # Lines 3+: metadata body (strip font tags)
        body = " ".join(lines[2:])
        body = _FONT_TAG_RE.sub("", body)

        # Extract datetime if present
        timestamp = None
        dt_match = _DATETIME_RE.search(body)
        if dt_match:
            timestamp = dt_match.group(0).replace(" ", "T")

        # Extract fields via regex
        entry: dict = {
            "index": index,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "timestamp": timestamp,
            "gps": None,
            "gimbal": None,
            "exposure": None,
            "focal_length_mm": None,
            "digital_zoom": None,
        }

        # GPS
        lat_m = _SRT_PATTERNS["latitude"].search(body)
        lon_m = _SRT_PATTERNS["longitude"].search(body)
        if lat_m and lon_m:
            lat = float(lat_m.group(1))
            lon = float(lon_m.group(1))
            if not (abs(lat) < 0.0001 and abs(lon) < 0.0001):
                rel_alt_m = _SRT_PATTERNS["rel_alt"].search(body)
                abs_alt_m = _SRT_PATTERNS["abs_alt"].search(body)
                entry["gps"] = {
                    "latitude": lat,
                    "longitude": lon,
                    "rel_altitude": float(rel_alt_m.group(1)) if rel_alt_m else None,
                    "abs_altitude": float(abs_alt_m.group(1)) if abs_alt_m else None,
                }

        # Gimbal
        yaw_m = _SRT_PATTERNS["gb_yaw"].search(body)
        pitch_m = _SRT_PATTERNS["gb_pitch"].search(body)
        roll_m = _SRT_PATTERNS["gb_roll"].search(body)
        if yaw_m and pitch_m and roll_m:
            entry["gimbal"] = {
                "yaw": float(yaw_m.group(1)),
                "pitch": float(pitch_m.group(1)),
                "roll": float(roll_m.group(1)),
            }

        # Exposure
        iso_m = _SRT_PATTERNS["iso"].search(body)
        shutter_m = _SRT_PATTERNS["shutter"].search(body)
        fnum_m = _SRT_PATTERNS["fnum"].search(body)
        ev_m = _SRT_PATTERNS["ev"].search(body)
        if iso_m or shutter_m:
            entry["exposure"] = {
                "iso": int(iso_m.group(1)) if iso_m else None,
                "shutter": shutter_m.group(1) if shutter_m else None,
                "fnum": round(int(fnum_m.group(1)) / 100, 1) if fnum_m else None,
                "ev": float(ev_m.group(1)) if ev_m else None,
            }

        # Focal length (value is ×10, e.g., 240 = 24mm)
        fl_m = _SRT_PATTERNS["focal_len"].search(body)
        if fl_m:
            entry["focal_length_mm"] = round(int(fl_m.group(1)) / 10, 1)

        # Digital zoom (10000 = 1.0×)
        dz_m = _SRT_PATTERNS["dzoom_ratio"].search(body)
        if dz_m:
            entry["digital_zoom"] = round(int(dz_m.group(1)) / 10000, 2)

        entries.append(entry)

    # Compute summary
    has_gps = any(e["gps"] is not None for e in entries)
    has_gimbal = any(e["gimbal"] is not None for e in entries)

    # FPS estimate from median entry interval
    fps_estimate = None
    if len(entries) >= 2:
        intervals = [
            entries[i + 1]["start_ms"] - entries[i]["start_ms"]
            for i in range(len(entries) - 1)
            if entries[i + 1]["start_ms"] > entries[i]["start_ms"]
        ]
        if intervals:
            median_interval = statistics.median(intervals)
            if median_interval > 0:
                fps_estimate = round(1000.0 / median_interval, 2)

    # GPS bounds
    gps_bounds = None
    if has_gps:
        gps_entries = [e["gps"] for e in entries if e["gps"] is not None]
        lats = [g["latitude"] for g in gps_entries]
        lons = [g["longitude"] for g in gps_entries]
        alts = [g["abs_altitude"] for g in gps_entries if g["abs_altitude"] is not None]
        gps_bounds = {
            "min_lat": min(lats),
            "max_lat": max(lats),
            "min_lon": min(lons),
            "max_lon": max(lons),
            "min_alt": min(alts) if alts else None,
            "max_alt": max(alts) if alts else None,
        }

    # Gimbal range
    gimbal_range = None
    if has_gimbal:
        gimbal_entries = [e["gimbal"] for e in entries if e["gimbal"] is not None]
        yaws = [g["yaw"] for g in gimbal_entries]
        pitches = [g["pitch"] for g in gimbal_entries]
        rolls = [g["roll"] for g in gimbal_entries]
        gimbal_range = {
            "yaw_min": round(min(yaws), 1),
            "yaw_max": round(max(yaws), 1),
            "pitch_min": round(min(pitches), 1),
            "pitch_max": round(max(pitches), 1),
            "roll_min": round(min(rolls), 1),
            "roll_max": round(max(rolls), 1),
        }

    return {
        "source": "dji_srt",
        "entry_count": len(entries),
        "has_gps": has_gps,
        "has_gimbal": has_gimbal,
        "has_altitude": any(
            e["gps"] is not None and e["gps"].get("abs_altitude") is not None
            for e in entries
        ),
        "fps_estimate": fps_estimate,
        "entries": entries,
        "gps_bounds": gps_bounds,
        "gimbal_range": gimbal_range,
    }


def match_srt_to_frames(
    srt_data: dict,
    frames_dir: str,
    extraction_fps: float,
) -> dict:
    """Match extracted frames to SRT telemetry entries by timestamp.

    Frame timestamps are derived from frame index and extraction FPS.
    Uses binary search on SRT start_ms for nearest match.

    Args:
        srt_data: Output from parse_dji_srt()
        frames_dir: Path to scenes/{id}/frames/ containing frame_00001.jpg etc.
        extraction_fps: The fps value used in ffmpeg extraction (e.g., 2.0)

    Returns:
        Dict with matched_frames list and match_quality stats.
    """
    frames_path = Path(frames_dir)
    frame_files = sorted(frames_path.glob("frame_*.jpg"))

    if not frame_files:
        return {
            "matched_frames": [],
            "match_quality": {
                "total_frames": 0,
                "matched_with_gps": 0,
                "matched_with_gimbal": 0,
                "mean_match_delta_ms": 0,
                "max_match_delta_ms": 0,
                "unmatched_frames": 0,
            },
        }

    entries = srt_data.get("entries", [])
    if not entries:
        return {
            "matched_frames": [
                {
                    "frame_file": f.name,
                    "frame_index": i + 1,
                    "source_timestamp_ms": round(i * 1000.0 / extraction_fps),
                    "srt_entry_index": None,
                    "match_delta_ms": None,
                    "gps": None,
                    "gimbal": None,
                    "exposure": None,
                }
                for i, f in enumerate(frame_files)
            ],
            "match_quality": {
                "total_frames": len(frame_files),
                "matched_with_gps": 0,
                "matched_with_gimbal": 0,
                "mean_match_delta_ms": 0,
                "max_match_delta_ms": 0,
                "unmatched_frames": len(frame_files),
            },
        }

    # Build sorted list of SRT start timestamps for binary search
    srt_times = [e["start_ms"] for e in entries]

    matched_frames: list[dict] = []
    deltas: list[float] = []
    gps_count = 0
    gimbal_count = 0
    unmatched = 0

    # Duration of SRT data
    srt_max_ms = entries[-1]["end_ms"] if entries else 0

    for i, frame_file in enumerate(frame_files):
        frame_ts_ms = round(i * 1000.0 / extraction_fps)

        # Binary search for closest SRT entry
        pos = bisect.bisect_left(srt_times, frame_ts_ms)

        best_entry = None
        best_delta = float("inf")

        # Check entry at pos and pos-1
        for candidate_pos in (pos - 1, pos):
            if 0 <= candidate_pos < len(entries):
                delta = abs(srt_times[candidate_pos] - frame_ts_ms)
                if delta < best_delta:
                    best_delta = delta
                    best_entry = entries[candidate_pos]

        if best_entry is None or best_delta > srt_max_ms:
            # Frame is outside SRT time range
            matched_frames.append({
                "frame_file": frame_file.name,
                "frame_index": i + 1,
                "source_timestamp_ms": frame_ts_ms,
                "srt_entry_index": None,
                "match_delta_ms": None,
                "gps": None,
                "gimbal": None,
                "exposure": None,
            })
            unmatched += 1
            continue

        matched_frames.append({
            "frame_file": frame_file.name,
            "frame_index": i + 1,
            "source_timestamp_ms": frame_ts_ms,
            "srt_entry_index": best_entry["index"],
            "match_delta_ms": round(best_delta),
            "gps": best_entry["gps"],
            "gimbal": best_entry["gimbal"],
            "exposure": best_entry["exposure"],
        })

        deltas.append(best_delta)
        if best_entry["gps"] is not None:
            gps_count += 1
        if best_entry["gimbal"] is not None:
            gimbal_count += 1

    return {
        "matched_frames": matched_frames,
        "match_quality": {
            "total_frames": len(frame_files),
            "matched_with_gps": gps_count,
            "matched_with_gimbal": gimbal_count,
            "mean_match_delta_ms": round(statistics.mean(deltas)) if deltas else 0,
            "max_match_delta_ms": round(max(deltas)) if deltas else 0,
            "unmatched_frames": unmatched,
        },
    }
