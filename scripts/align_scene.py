#!/usr/bin/env python3
"""Residual alignment tool for VR Scout v3.

Takes an existing alignment.json and applies a Y-axis offset (meters) and/or
Y-axis rotation (degrees) to produce an updated alignment.json. This is used
for manual floor-plane and orientation adjustments after the automatic
gravity alignment (COLMAP model_orientation_aligner) has been applied.

The transform is stored as a column-major 4x4 matrix (16 floats), matching
the Three.js Matrix4.elements layout.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def identity_matrix() -> list[float]:
    """Return a 4x4 identity matrix as a flat 16-element list (column-major)."""
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ]


def y_rotation_matrix(degrees: float) -> list[float]:
    """Return a 4x4 Y-axis rotation matrix (column-major)."""
    rad = math.radians(degrees)
    c = math.cos(rad)
    s = math.sin(rad)
    # Column-major layout:
    # col0: (c, 0, -s, 0), col1: (0, 1, 0, 0), col2: (s, 0, c, 0), col3: (0, 0, 0, 1)
    return [
        c,  0, -s, 0,
        0,  1,  0, 0,
        s,  0,  c, 0,
        0,  0,  0, 1,
    ]


def y_offset_matrix(offset: float) -> list[float]:
    """Return a 4x4 translation matrix with Y offset (column-major)."""
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, offset, 0, 1,
    ]


def multiply_4x4(a: list[float], b: list[float]) -> list[float]:
    """Multiply two 4x4 matrices in column-major order: result = A * B."""
    result = [0.0] * 16
    for col in range(4):
        for row in range(4):
            s = 0.0
            for k in range(4):
                # a[row + k*4] * b[k + col*4]
                s += a[row + k * 4] * b[k + col * 4]
            result[row + col * 4] = s
    return result


def clean_near_zero(values: list[float], eps: float = 1e-10) -> list[float]:
    """Round near-zero values to exactly zero for cleaner output."""
    return [0.0 if abs(v) < eps else v for v in values]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Apply Y-offset and/or Y-rotation adjustments to an alignment.json."
    )
    parser.add_argument(
        "--input",
        dest="input_alignment",
        required=True,
        help="Path to current alignment.json",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to write updated alignment.json",
    )
    parser.add_argument(
        "--y-offset",
        type=float,
        default=0.0,
        help="Y-axis offset in meters (positive = up, default: 0)",
    )
    parser.add_argument(
        "--y-rotation",
        type=float,
        default=0.0,
        help="Y-axis rotation in degrees (default: 0)",
    )

    args = parser.parse_args()

    input_path = Path(args.input_alignment)
    output_path = Path(args.output)

    if not input_path.is_file():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Read existing alignment
    with open(input_path) as f:
        alignment: dict[str, Any] = json.load(f)

    current_transform = alignment.get("transform", identity_matrix())
    if len(current_transform) != 16:
        print(
            f"ERROR: Invalid transform — expected 16 values, got {len(current_transform)}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Build adjustment matrix: translate first, then rotate
    # Final = Rotation * Translation * Current
    adjustment = identity_matrix()

    if args.y_offset != 0.0:
        offset_mat = y_offset_matrix(args.y_offset)
        adjustment = multiply_4x4(offset_mat, adjustment)

    if args.y_rotation != 0.0:
        rot_mat = y_rotation_matrix(args.y_rotation)
        adjustment = multiply_4x4(rot_mat, adjustment)

    # Apply adjustment to current transform
    new_transform = multiply_4x4(adjustment, current_transform)
    new_transform = clean_near_zero(new_transform)

    # Update alignment
    alignment["transform"] = new_transform
    alignment["source"] = (
        f"adjusted (y_offset={args.y_offset}m, y_rotation={args.y_rotation}deg)"
    )

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(alignment, f, indent=2)

    print(f"Alignment updated: {output_path}")
    print(f"  Y offset: {args.y_offset}m")
    print(f"  Y rotation: {args.y_rotation} degrees")


if __name__ == "__main__":
    main()
