#!/usr/bin/env python3
"""Validate a COLMAP sparse reconstruction and output a JSON report.

Reads COLMAP binary files (cameras.bin, images.bin, points3D.bin) and
produces a structured validation report with registration rate, reprojection
error, point count, and alignment checks.

Exit codes:
    0 — all checks pass
    1 — warnings (registration rate 50-89%)
    2 — blocked (registration rate < 50% or missing files)
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys
from pathlib import Path
from typing import Any


# ─── COLMAP Binary Readers ────────────────────────────────────────
# Based on COLMAP's binary format specification.
# cameras.bin: camera_id, model_id, width, height, params[]
# images.bin: image_id, qw qx qy qz, tx ty tz, camera_id, name, points2D[]
# points3D.bin: point3D_id, xyz, rgb, error, track[]

CAMERA_MODEL_NAMES = {
    0: "SIMPLE_PINHOLE",
    1: "PINHOLE",
    2: "SIMPLE_RADIAL",
    3: "RADIAL",
    4: "OPENCV",
    5: "OPENCV_FISHEYE",
    6: "FULL_OPENCV",
    7: "FOV",
    8: "SIMPLE_RADIAL_FISHEYE",
    9: "RADIAL_FISHEYE",
    10: "THIN_PRISM_FISHEYE",
}

CAMERA_MODEL_NUM_PARAMS = {
    0: 3, 1: 4, 2: 4, 3: 5, 4: 8, 5: 8, 6: 12, 7: 5, 8: 4, 9: 5, 10: 12,
}


def read_cameras_bin(path: Path) -> dict[int, dict[str, Any]]:
    """Read cameras.bin and return dict of camera_id -> camera info."""
    cameras: dict[int, dict[str, Any]] = {}
    with open(path, "rb") as f:
        num_cameras = struct.unpack("<Q", f.read(8))[0]
        for _ in range(num_cameras):
            camera_id = struct.unpack("<I", f.read(4))[0]
            model_id = struct.unpack("<i", f.read(4))[0]
            width = struct.unpack("<Q", f.read(8))[0]
            height = struct.unpack("<Q", f.read(8))[0]
            num_params = CAMERA_MODEL_NUM_PARAMS.get(model_id, 0)
            params = struct.unpack(f"<{num_params}d", f.read(8 * num_params))
            cameras[camera_id] = {
                "model_id": model_id,
                "model_name": CAMERA_MODEL_NAMES.get(model_id, f"UNKNOWN_{model_id}"),
                "width": width,
                "height": height,
                "params": list(params),
            }
    return cameras


def read_images_bin(path: Path) -> dict[int, dict[str, Any]]:
    """Read images.bin and return dict of image_id -> image info."""
    images: dict[int, dict[str, Any]] = {}
    with open(path, "rb") as f:
        num_images = struct.unpack("<Q", f.read(8))[0]
        for _ in range(num_images):
            image_id = struct.unpack("<I", f.read(4))[0]
            qvec = struct.unpack("<4d", f.read(32))
            tvec = struct.unpack("<3d", f.read(24))
            camera_id = struct.unpack("<I", f.read(4))[0]
            # Read null-terminated name
            name_bytes = b""
            while True:
                ch = f.read(1)
                if ch == b"\x00":
                    break
                name_bytes += ch
            name = name_bytes.decode("utf-8")
            # Read 2D points
            num_points2d = struct.unpack("<Q", f.read(8))[0]
            points2d = []
            for _ in range(num_points2d):
                x, y = struct.unpack("<2d", f.read(16))
                point3d_id = struct.unpack("<q", f.read(8))[0]
                points2d.append({"xy": (x, y), "point3d_id": point3d_id})
            images[image_id] = {
                "qvec": qvec,
                "tvec": tvec,
                "camera_id": camera_id,
                "name": name,
                "points2d": points2d,
            }
    return images


def read_points3d_bin(path: Path) -> dict[int, dict[str, Any]]:
    """Read points3D.bin and return dict of point3d_id -> point info."""
    points: dict[int, dict[str, Any]] = {}
    with open(path, "rb") as f:
        num_points = struct.unpack("<Q", f.read(8))[0]
        for _ in range(num_points):
            point3d_id = struct.unpack("<Q", f.read(8))[0]
            xyz = struct.unpack("<3d", f.read(24))
            rgb = struct.unpack("<3B", f.read(3))
            error = struct.unpack("<d", f.read(8))[0]
            track_length = struct.unpack("<Q", f.read(8))[0]
            # Each track element: image_id (4 bytes) + point2d_idx (4 bytes)
            f.read(track_length * 8)
            points[point3d_id] = {
                "xyz": xyz,
                "rgb": rgb,
                "error": error,
                "track_length": track_length,
            }
    return points


def count_images_on_disk(image_path: Path) -> tuple[int, list[str]]:
    """Count jpg/png images in directory and return (count, filenames)."""
    if not image_path.is_dir():
        return 0, []
    names = sorted(
        f.name
        for f in image_path.iterdir()
        if f.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    return len(names), names


def check_alignment_is_identity(
    original_path: Path | None, aligned_path: Path
) -> tuple[bool, bool]:
    """Compare original and aligned images.bin to detect identity transform.

    Returns (alignment_applied, alignment_is_identity).
    """
    if original_path is None or not (original_path / "images.bin").is_file():
        return False, True

    orig_images = read_images_bin(original_path / "images.bin")
    aligned_images = read_images_bin(aligned_path / "images.bin")

    if not orig_images or not aligned_images:
        return False, True

    # Compare a few camera poses to see if they changed
    total_diff = 0.0
    count = 0
    for img_id in orig_images:
        if img_id in aligned_images:
            for i in range(3):
                total_diff += abs(
                    orig_images[img_id]["tvec"][i] - aligned_images[img_id]["tvec"][i]
                )
            count += 1
        if count >= 10:
            break

    if count == 0:
        return False, True

    mean_diff = total_diff / count
    is_identity = mean_diff < 1e-6
    return True, is_identity


def estimate_scene_scale(points: dict[int, dict[str, Any]]) -> float:
    """Estimate scene scale in arbitrary units from point cloud extents."""
    if not points:
        return 0.0
    xs = [p["xyz"][0] for p in points.values()]
    ys = [p["xyz"][1] for p in points.values()]
    zs = [p["xyz"][2] for p in points.values()]
    dx = max(xs) - min(xs)
    dy = max(ys) - min(ys)
    dz = max(zs) - min(zs)
    return max(dx, dy, dz)


def validate(
    sparse_path: Path,
    original_sparse_path: Path | None,
    image_path: Path,
    min_registration_rate: float,
) -> tuple[dict[str, Any], int]:
    """Run validation and return (report_dict, exit_code)."""
    warnings: list[str] = []

    # Check required files exist
    cameras_bin = sparse_path / "cameras.bin"
    images_bin = sparse_path / "images.bin"
    points3d_bin = sparse_path / "points3D.bin"

    for required in [cameras_bin, images_bin, points3d_bin]:
        if not required.is_file():
            return {
                "error": f"Missing required file: {required}",
                "pass": False,
            }, 2

    # Read COLMAP data
    cameras = read_cameras_bin(cameras_bin)
    images = read_images_bin(images_bin)
    points = read_points3d_bin(points3d_bin)

    # Count images on disk
    total_images, all_image_names = count_images_on_disk(image_path)
    if total_images == 0:
        # Fallback: count from what COLMAP says it saw
        warnings.append("Could not count images on disk; using COLMAP image count.")
        # total_images stays 0, registration_rate will be computed differently

    registered_images = len(images)
    registered_names = {img["name"] for img in images.values()}

    if total_images > 0:
        registration_rate = registered_images / total_images
        unregistered = [n for n in all_image_names if n not in registered_names]
    else:
        registration_rate = 1.0 if registered_images > 0 else 0.0
        unregistered = []

    # Mean reprojection error from 3D points
    if points:
        mean_reproj_error = sum(p["error"] for p in points.values()) / len(points)
    else:
        mean_reproj_error = 0.0
        warnings.append("No 3D points found in reconstruction.")

    point_count = len(points)
    points_per_image = point_count / registered_images if registered_images > 0 else 0.0

    # Camera model
    camera_model = "UNKNOWN"
    if cameras:
        first_cam = next(iter(cameras.values()))
        camera_model = first_cam["model_name"]

    # Alignment check
    alignment_applied, alignment_is_identity = check_alignment_is_identity(
        original_sparse_path, sparse_path
    )

    if alignment_applied and alignment_is_identity:
        warnings.append(
            "Gravity alignment produced identity transform. "
            "Auto-alignment may have failed — manual alignment will be needed."
        )

    # Scene scale estimate
    scene_scale = estimate_scene_scale(points)

    # Reprojection error warning
    if mean_reproj_error > 1.0:
        warnings.append(
            f"High mean reprojection error: {mean_reproj_error:.2f}px. "
            "Training quality may suffer."
        )

    # Registration rate warnings
    pass_result = True
    exit_code = 0

    if registration_rate < 0.5:
        warnings.append(
            f"Registration rate {registration_rate:.1%} is below 50%. "
            "Re-shoot recommended."
        )
        pass_result = False
        exit_code = 2
    elif registration_rate < min_registration_rate:
        warnings.append(
            f"Registration rate {registration_rate:.1%} is below target "
            f"{min_registration_rate:.0%}. Check frame overlap and quality."
        )
        exit_code = 1

    report: dict[str, Any] = {
        "registration_rate": round(registration_rate, 4),
        "registered_images": registered_images,
        "total_images": total_images if total_images > 0 else registered_images,
        "mean_reprojection_error_px": round(mean_reproj_error, 4),
        "point_count": point_count,
        "points_per_image": round(points_per_image, 1),
        "camera_model": camera_model,
        "alignment_applied": alignment_applied,
        "alignment_is_identity": alignment_is_identity,
        "unregistered_images": unregistered[:20],  # Cap at 20 for readability
        "scene_scale_estimate_meters": round(scene_scale, 2),
        "warnings": warnings,
        "pass": pass_result,
    }

    # ── Telemetry enrichment ─────────────────────────────────────
    # If metadata.json and/or gravity_validation.json exist in the scene
    # directory (sibling of sparse_path), include telemetry in the report.
    scene_dir = sparse_path.parent
    # If sparse_path is aligned/, scene_dir is the scene root.
    # If it's sparse/0/, go up two levels.
    if scene_dir.name in ("0", "1", "2"):
        scene_dir = scene_dir.parent.parent

    metadata_file = scene_dir / "metadata.json"
    gravity_file = scene_dir / "gravity_validation.json"

    telemetry: dict[str, Any] | None = None

    if metadata_file.is_file():
        try:
            meta = json.loads(metadata_file.read_text())
            telemetry = {
                "alignment_strategy": meta.get("alignment_strategy", "manhattan"),
                "camera_model": (meta.get("container") or {}).get("camera_model"),
                "gps_coverage": 0.0,
                "gravity_check_degrees": None,
                "gravity_agreement": None,
            }

            frame_matching = meta.get("frame_matching")
            if frame_matching and frame_matching.get("total_frames", 0) > 0:
                telemetry["gps_coverage"] = round(
                    frame_matching.get("matched_with_gps", 0)
                    / frame_matching["total_frames"],
                    4,
                )

            if gravity_file.is_file():
                try:
                    gv = json.loads(gravity_file.read_text())
                    telemetry["gravity_check_degrees"] = gv.get("angle_between_degrees")
                    telemetry["gravity_agreement"] = gv.get("agreement")
                except (json.JSONDecodeError, OSError):
                    pass

        except (json.JSONDecodeError, OSError):
            pass

    if telemetry is not None:
        report["telemetry"] = telemetry

    return report, exit_code


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate a COLMAP sparse reconstruction and output a JSON report."
    )
    parser.add_argument(
        "--sparse_path",
        required=True,
        help="Path to the sparse reconstruction directory (with cameras.bin, images.bin, points3D.bin)",
    )
    parser.add_argument(
        "--original_sparse_path",
        default=None,
        help="Path to the pre-alignment sparse reconstruction (for identity check)",
    )
    parser.add_argument(
        "--image_path",
        required=True,
        help="Path to the extracted frames directory",
    )
    parser.add_argument(
        "--output_json",
        required=True,
        help="Path to write the validation report JSON",
    )
    parser.add_argument(
        "--min_registration_rate",
        type=float,
        default=0.9,
        help="Minimum registration rate to pass without warning (default: 0.9)",
    )

    args = parser.parse_args()

    sparse_path = Path(args.sparse_path)
    original_sparse_path = Path(args.original_sparse_path) if args.original_sparse_path else None
    image_path = Path(args.image_path)
    output_json = Path(args.output_json)

    report, exit_code = validate(
        sparse_path=sparse_path,
        original_sparse_path=original_sparse_path,
        image_path=image_path,
        min_registration_rate=args.min_registration_rate,
    )

    # Write report
    report_json = json.dumps(report, indent=2)

    if str(output_json) == "/dev/null":
        # When used inline by process.sh for quick registration check,
        # print to stdout instead
        print(report_json)
    else:
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(report_json)
        print(f"Validation report written to: {output_json}")

    # Also print summary to stdout
    if "error" in report:
        print(f"ERROR: {report['error']}", file=sys.stderr)
    else:
        print(f"Registration: {report['registered_images']}/{report['total_images']} "
              f"({report['registration_rate']:.1%})")
        print(f"Reprojection error: {report['mean_reprojection_error_px']:.2f}px (mean)")
        print(f"3D points: {report['point_count']}")
        if report["warnings"]:
            for w in report["warnings"]:
                print(f"WARNING: {w}", file=sys.stderr)

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
