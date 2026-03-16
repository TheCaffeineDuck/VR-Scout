#!/usr/bin/env python3
"""Compare gimbal-derived gravity against COLMAP alignment gravity.

Reads gimbal data from frame_metadata.json to compute a gravity prior,
then reads the COLMAP aligned model to extract the implied gravity direction.
Compares the two and writes a gravity_validation.json report.

Usage:
  python validate_gravity.py \
    --frame_metadata /path/to/frame_metadata.json \
    --aligned_path /path/to/aligned/ \
    --output /path/to/gravity_validation.json

Exit code is always 0 — gravity validation is informational only.
"""

import argparse
import json
import math
import struct
import sys
import traceback
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server.utils.geo_utils import generate_gravity_prior


def _read_colmap_gravity(aligned_path: str) -> list[float] | None:
    """Extract the implied gravity (up) direction from the COLMAP aligned model.

    The model_orientation_aligner rotates the reconstruction so that gravity
    aligns with the -Y axis (COLMAP convention). We verify this by checking
    the average camera up-vector in the aligned model.

    Returns [gx, gy, gz] gravity vector (world frame), or None if unreadable.
    """
    images_bin = Path(aligned_path) / "images.bin"
    if not images_bin.is_file():
        return None

    try:
        up_vectors: list[list[float]] = []

        with open(images_bin, "rb") as fid:
            # Read number of images
            data = fid.read(8)
            if len(data) < 8:
                return None
            (num_images,) = struct.unpack("<Q", data)

            for _ in range(num_images):
                # image_id (4) + qw,qx,qy,qz (4×8) + tx,ty,tz (3×8) + camera_id (4)
                header = fid.read(4 + 32 + 24 + 4)
                if len(header) < 64:
                    break

                qw, qx, qy, qz = struct.unpack("<dddd", header[4:36])

                # Convert quaternion to rotation matrix
                r00 = 1 - 2 * qy * qy - 2 * qz * qz
                r01 = 2 * qx * qy - 2 * qz * qw
                r02 = 2 * qx * qz + 2 * qy * qw
                r10 = 2 * qx * qy + 2 * qz * qw
                r11 = 1 - 2 * qx * qx - 2 * qz * qz
                r12 = 2 * qy * qz - 2 * qx * qw
                r20 = 2 * qx * qz - 2 * qy * qw
                r21 = 2 * qy * qz + 2 * qx * qw
                r22 = 1 - 2 * qx * qx - 2 * qy * qy

                # Camera up direction in world frame is R^T * [0, -1, 0]
                # (camera Y is down in COLMAP convention)
                up_x = -r01
                up_y = -r11
                up_z = -r21
                up_vectors.append([up_x, up_y, up_z])

                # Read image name (null-terminated)
                name_chars = []
                while True:
                    ch = fid.read(1)
                    if not ch or ch == b"\x00":
                        break
                    name_chars.append(ch)

                # Read number of 2D points and skip them
                pts_data = fid.read(8)
                if len(pts_data) < 8:
                    break
                (num_points,) = struct.unpack("<Q", pts_data)
                # Each 2D point: x(8) + y(8) + point3D_id(8) = 24 bytes
                fid.read(num_points * 24)

        if not up_vectors:
            return None

        # Average up vector across all cameras
        avg_x = sum(v[0] for v in up_vectors) / len(up_vectors)
        avg_y = sum(v[1] for v in up_vectors) / len(up_vectors)
        avg_z = sum(v[2] for v in up_vectors) / len(up_vectors)

        # Normalize
        mag = math.sqrt(avg_x ** 2 + avg_y ** 2 + avg_z ** 2)
        if mag > 0:
            avg_x /= mag
            avg_y /= mag
            avg_z /= mag

        # Gravity is opposite to up: g = -up
        return [round(-avg_x, 6), round(-avg_y, 6), round(-avg_z, 6)]

    except Exception:
        traceback.print_exc()
        return None


def _angle_between(v1: list[float], v2: list[float]) -> float:
    """Angle in degrees between two 3D vectors."""
    dot = sum(a * b for a, b in zip(v1, v2))
    # Clamp to [-1, 1] to avoid acos domain errors from float imprecision
    dot = max(-1.0, min(1.0, dot))
    return math.degrees(math.acos(dot))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare gimbal gravity prior against COLMAP alignment gravity."
    )
    parser.add_argument(
        "--frame_metadata",
        required=True,
        help="Path to frame_metadata.json.",
    )
    parser.add_argument(
        "--aligned_path",
        required=True,
        help="Path to COLMAP aligned model directory.",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to write gravity_validation.json.",
    )

    args = parser.parse_args()

    # Load matched frame data
    fm_path = Path(args.frame_metadata)
    if not fm_path.is_file():
        print(f"Frame metadata not found: {args.frame_metadata}")
        print("Skipping gravity validation.")
        return

    with open(fm_path) as f:
        matched_frames = json.load(f)

    # Generate gravity prior from gimbal data
    gimbal_prior = generate_gravity_prior(matched_frames)
    print(
        f"Gimbal gravity prior: {gimbal_prior['gravity_vector']} "
        f"(confidence: {gimbal_prior['confidence']})"
    )

    # Read COLMAP gravity
    colmap_gravity = _read_colmap_gravity(args.aligned_path)

    result: dict = {
        "gimbal_gravity": gimbal_prior,
        "colmap_gravity": None,
        "angle_between_degrees": None,
        "agreement": "unknown",
        "notes": "",
    }

    if colmap_gravity is None:
        result["notes"] = (
            "Could not read COLMAP aligned model. "
            "Gravity cross-check skipped."
        )
        print(result["notes"])
    else:
        result["colmap_gravity"] = {
            "vector": colmap_gravity,
            "source": "model_orientation_aligner",
        }

        angle = _angle_between(gimbal_prior["gravity_vector"], colmap_gravity)
        result["angle_between_degrees"] = round(angle, 1)

        if angle < 10.0:
            result["agreement"] = "agree"
            result["notes"] = (
                f"Gravity directions agree within {angle:.1f} degrees. "
                f"Alignment is consistent."
            )
        elif angle < 30.0:
            result["agreement"] = "marginal"
            result["notes"] = (
                f"Gravity directions differ by {angle:.1f} degrees. "
                f"Alignment may be slightly off."
            )
        else:
            result["agreement"] = "disagree"
            result["notes"] = (
                f"Gravity directions disagree by {angle:.1f} degrees. "
                f"Manual review recommended."
            )

        print(
            f"COLMAP gravity: {colmap_gravity}, "
            f"angle: {angle:.1f} deg, "
            f"agreement: {result['agreement']}"
        )

    # Write result
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Gravity validation written to: {args.output}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(f"ERROR: Gravity validation failed:\n{traceback.format_exc()}")
        print("Pipeline will continue without gravity cross-check.")
    sys.exit(0)  # Always exit 0
