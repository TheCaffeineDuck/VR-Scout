#!/usr/bin/env python3
"""CLI entry point for video metadata extraction and DJI SRT parsing.

Called by process.sh at Step 1.5 (metadata extraction).
Wraps functions from server.utils.metadata_extractor.

Usage:
  # Container metadata only:
  python extract_metadata.py --video /path/to/video.mp4 --output /path/to/metadata.json

  # With SRT + frame matching:
  python extract_metadata.py \
    --video /path/to/video.mp4 \
    --srt /path/to/source.srt \
    --frames_dir /path/to/frames/ \
    --extraction_fps 2.0 \
    --output /path/to/metadata.json \
    --frame_match_output /path/to/frame_metadata.json

Exit code is always 0 — metadata extraction must never block the pipeline.
"""

import argparse
import asyncio
import json
import sys
import traceback
from pathlib import Path

# Add project root to path so we can import server.utils
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server.utils.metadata_extractor import (
    extract_video_metadata,
    match_srt_to_frames,
    parse_dji_srt,
)


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract video metadata and parse DJI SRT telemetry."
    )
    parser.add_argument(
        "--video", required=True, help="Path to the source video file."
    )
    parser.add_argument(
        "--output", required=True, help="Path to write metadata.json."
    )
    parser.add_argument(
        "--srt", default=None, help="Path to DJI SRT sidecar file (optional)."
    )
    parser.add_argument(
        "--frames_dir",
        default=None,
        help="Path to extracted frames directory (required with --srt).",
    )
    parser.add_argument(
        "--extraction_fps",
        type=float,
        default=2.0,
        help="FPS used for frame extraction (default: 2.0).",
    )
    parser.add_argument(
        "--frame_match_output",
        default=None,
        help="Path to write per-frame matched metadata (optional).",
    )

    args = parser.parse_args()

    # ── Extract container metadata (always) ──────────────────────
    print(f"Extracting container metadata from: {args.video}")
    container_meta = await extract_video_metadata(args.video)

    metadata: dict = {
        "container": {
            "camera_make": container_meta.get("camera_make"),
            "camera_model": container_meta.get("camera_model"),
            "creation_time": container_meta.get("creation_time"),
            "resolution": container_meta.get("resolution"),
            "duration_seconds": container_meta.get("duration_seconds"),
            "fps": container_meta.get("fps"),
            "codec": container_meta.get("codec"),
            "rotation": container_meta.get("rotation", 0),
            "gps": container_meta.get("gps"),
            "has_gravity_metadata": container_meta.get("has_gravity_metadata", False),
        },
        "srt": None,
        "frame_matching": None,
        "alignment_strategy": "manhattan",
        "has_real_world_scale": False,
    }

    camera_desc = container_meta.get("camera_model") or "Unknown camera"
    print(f"Camera: {container_meta.get('camera_make', '?')} {camera_desc}")

    if container_meta.get("gps"):
        gps = container_meta["gps"]
        print(f"Container GPS: {gps['latitude']:.6f}, {gps['longitude']:.6f}")

    # ── Parse SRT if provided ────────────────────────────────────
    if args.srt and Path(args.srt).is_file():
        print(f"Parsing DJI SRT: {args.srt}")
        try:
            srt_data = parse_dji_srt(args.srt)

            metadata["srt"] = {
                "available": True,
                "entry_count": srt_data["entry_count"],
                "has_gps": srt_data["has_gps"],
                "has_gimbal": srt_data["has_gimbal"],
                "has_altitude": srt_data["has_altitude"],
                "fps_estimate": srt_data["fps_estimate"],
                "gps_bounds": srt_data["gps_bounds"],
                "gimbal_range": srt_data["gimbal_range"],
            }

            print(
                f"SRT: {srt_data['entry_count']} entries, "
                f"GPS: {srt_data['has_gps']}, "
                f"Gimbal: {srt_data['has_gimbal']}"
            )

            # Determine alignment strategy from SRT data
            if srt_data["has_gps"]:
                metadata["alignment_strategy"] = "geo_registration"
                metadata["has_real_world_scale"] = True
            elif srt_data["has_gimbal"]:
                metadata["alignment_strategy"] = "gimbal_gravity"

            # ── Match SRT to frames if frames_dir provided ───────
            if args.frames_dir and Path(args.frames_dir).is_dir():
                print(
                    f"Matching SRT entries to frames in: {args.frames_dir} "
                    f"(fps={args.extraction_fps})"
                )
                frame_match = match_srt_to_frames(
                    srt_data, args.frames_dir, args.extraction_fps
                )

                quality = frame_match["match_quality"]
                metadata["frame_matching"] = {
                    "total_frames": quality["total_frames"],
                    "matched_with_gps": quality["matched_with_gps"],
                    "matched_with_gimbal": quality["matched_with_gimbal"],
                    "mean_match_delta_ms": quality["mean_match_delta_ms"],
                    "max_match_delta_ms": quality["max_match_delta_ms"],
                    "unmatched_frames": quality["unmatched_frames"],
                }

                print(
                    f"Frame matching: {quality['total_frames']} frames, "
                    f"GPS: {quality['matched_with_gps']}, "
                    f"Gimbal: {quality['matched_with_gimbal']}, "
                    f"mean delta: {quality['mean_match_delta_ms']}ms"
                )

                if quality["max_match_delta_ms"] > 200:
                    print(
                        f"WARNING: Max match delta is {quality['max_match_delta_ms']}ms "
                        f"(>200ms). SRT and video timelines may be misaligned."
                    )

                # Write per-frame match data
                if args.frame_match_output:
                    out_path = Path(args.frame_match_output)
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(out_path, "w") as f:
                        json.dump(frame_match, f, indent=2)
                    print(f"Frame metadata written to: {args.frame_match_output}")

        except Exception:
            print(f"WARNING: SRT parsing failed:\n{traceback.format_exc()}")
            print("Continuing without SRT telemetry.")

    # ── Write combined metadata ──────────────────────────────────
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"Metadata written to: {args.output}")
    print(f"Alignment strategy: {metadata['alignment_strategy']}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        # Metadata extraction must NEVER block the pipeline
        print(f"ERROR: Metadata extraction failed:\n{traceback.format_exc()}")
        print("Pipeline will continue with Manhattan alignment.")
        sys.exit(0)  # Always exit 0
