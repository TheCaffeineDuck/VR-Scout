#!/usr/bin/env python3
"""Generate a COLMAP geo-registration reference file from GPS frame data.

Reads frame_metadata.json (output of extract_metadata.py with SRT matching),
converts GPS coordinates to local ENU, and writes a COLMAP-compatible
geo-reference text file.

Usage:
  python generate_geo_reference.py \
    --frame_metadata /path/to/frame_metadata.json \
    --output /path/to/geo_reference.txt

Exit codes:
  0 = success (geo-reference file written)
  1 = no GPS data available (non-fatal — pipeline falls back to orientation aligner)
"""

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server.utils.geo_utils import generate_geo_registration_file


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate COLMAP geo-registration file from GPS frame data."
    )
    parser.add_argument(
        "--frame_metadata",
        required=True,
        help="Path to frame_metadata.json (from extract_metadata.py).",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to write geo_reference.txt.",
    )

    args = parser.parse_args()

    # Load matched frame data
    fm_path = Path(args.frame_metadata)
    if not fm_path.is_file():
        print(f"Frame metadata file not found: {args.frame_metadata}")
        return 1

    with open(fm_path) as f:
        matched_frames = json.load(f)

    # Generate geo-reference file
    written = generate_geo_registration_file(matched_frames, args.output)

    if written == 0:
        print("No frames with valid GPS data. Geo-registration not available.")
        return 1

    print(f"Geo-reference file written: {args.output} ({written} frames)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
