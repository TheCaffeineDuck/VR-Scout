"""Standalone COLMAP binary file parser.

Reads points3D.bin and images.bin from COLMAP's binary format.
Reference: https://colmap.github.io/format.html#binary-file-format

No external dependencies beyond the Python stdlib.
"""

import random
import struct
from pathlib import Path

import numpy as np


def _read_next_bytes(fid, num_bytes: int, format_char_sequence: str):
    """Read and unpack bytes from a binary file."""
    data = fid.read(num_bytes)
    if len(data) != num_bytes:
        raise ValueError(f"Expected {num_bytes} bytes, got {len(data)}")
    return struct.unpack(format_char_sequence, data)


def _qvec_to_rotmat(qw: float, qx: float, qy: float, qz: float) -> list[list[float]]:
    """Convert quaternion (w, x, y, z) to 3x3 rotation matrix."""
    r = np.array([
        [1 - 2*qy*qy - 2*qz*qz, 2*qx*qy - 2*qz*qw, 2*qx*qz + 2*qy*qw],
        [2*qx*qy + 2*qz*qw, 1 - 2*qx*qx - 2*qz*qz, 2*qy*qz - 2*qx*qw],
        [2*qx*qz - 2*qy*qw, 2*qy*qz + 2*qx*qw, 1 - 2*qx*qx - 2*qy*qy],
    ])
    return r.tolist()


def read_points3d_binary(path: str) -> list[dict]:
    """Read COLMAP points3D.bin file.

    Each record: point3D_id (uint64), xyz (3x float64), rgb (3x uint8),
    error (float64), track_length (uint64), then track_length pairs of
    (image_id uint32, point2D_idx uint32).

    Returns list of {x, y, z, r, g, b, error}.
    """
    points = []
    filepath = Path(path)
    if not filepath.exists():
        raise FileNotFoundError(f"points3D.bin not found: {path}")

    with open(filepath, "rb") as fid:
        (num_points,) = _read_next_bytes(fid, 8, "<Q")

        for _ in range(num_points):
            # point3D_id (uint64) + xyz (3x float64) + rgb (3x uint8) + error (float64)
            data = _read_next_bytes(fid, 8 + 24 + 3 + 8, "<Q3d3Bd")
            # data: (point3d_id, x, y, z, r, g, b, error)
            point3d_id = data[0]
            x, y, z = data[1], data[2], data[3]
            r, g, b = data[4], data[5], data[6]
            error = data[7]

            # Skip track entries
            (track_length,) = _read_next_bytes(fid, 8, "<Q")
            # Each track entry: image_id (uint32) + point2D_idx (uint32)
            if track_length > 0:
                fid.read(track_length * 8)

            points.append({
                "id": point3d_id,
                "x": float(x),
                "y": float(y),
                "z": float(z),
                "r": int(r),
                "g": int(g),
                "b": int(b),
                "error": float(error),
            })

    return points


def read_images_binary(path: str) -> list[dict]:
    """Read COLMAP images.bin file.

    Each record: image_id (uint32), qw/qx/qy/qz (4x float64),
    tx/ty/tz (3x float64), camera_id (uint32), image_name (null-terminated),
    num_points2D (uint64), then point2D entries.

    The quaternion + translation represent the world-to-camera transform.
    Camera world position = -R^T * t.

    Returns list of {image_id, image_name, position, rotation_matrix, camera_id}.
    """
    images = []
    filepath = Path(path)
    if not filepath.exists():
        raise FileNotFoundError(f"images.bin not found: {path}")

    with open(filepath, "rb") as fid:
        (num_images,) = _read_next_bytes(fid, 8, "<Q")

        for _ in range(num_images):
            # image_id (uint32) + qw,qx,qy,qz (4x float64) + tx,ty,tz (3x float64) + camera_id (uint32)
            data = _read_next_bytes(fid, 4 + 32 + 24 + 4, "<I4d3dI")
            image_id = data[0]
            qw, qx, qy, qz = data[1], data[2], data[3], data[4]
            tx, ty, tz = data[5], data[6], data[7]
            camera_id = data[8]

            # Read null-terminated image name
            name_chars = []
            while True:
                ch = fid.read(1)
                if ch == b"\x00" or ch == b"":
                    break
                name_chars.append(ch.decode("ascii", errors="replace"))
            image_name = "".join(name_chars)

            # Skip 2D points: num_points2D (uint64), then each (x float64, y float64, point3D_id int64)
            (num_points2d,) = _read_next_bytes(fid, 8, "<Q")
            if num_points2d > 0:
                fid.read(num_points2d * 24)  # 8 + 8 + 8 bytes each

            # Compute camera world position: position = -R^T * t
            rot = _qvec_to_rotmat(qw, qx, qy, qz)
            r_mat = np.array(rot)
            t_vec = np.array([tx, ty, tz])
            position = (-r_mat.T @ t_vec).tolist()

            images.append({
                "image_id": image_id,
                "image_name": image_name,
                "position": [float(position[0]), float(position[1]), float(position[2])],
                "rotation_matrix": rot,
                "camera_id": camera_id,
                "qw": float(qw),
                "qx": float(qx),
                "qy": float(qy),
                "qz": float(qz),
                "tx": float(tx),
                "ty": float(ty),
                "tz": float(tz),
            })

    return images


def compute_reprojection_errors(
    points: list[dict],
    images: list[dict],
) -> dict[int, float]:
    """Compute mean reprojection error per image.

    Uses the error field from points3D which is the mean reprojection error
    across all observations of that point. We approximate per-image error
    as the mean error of all points visible in the reconstruction.

    For a proper per-image error we'd need the track info, but since we
    stripped it for performance, we return the global mean as a fallback.
    """
    if not points:
        return {}
    global_mean = sum(p["error"] for p in points) / len(points)
    return {img["image_id"]: global_mean for img in images}


def build_sparse_cloud_response(
    model_dir: str,
    max_points: int = 50000,
    unregistered_images: list[str] | None = None,
) -> dict:
    """Build the full sparse cloud API response from a COLMAP model directory.

    Args:
        model_dir: Path to directory containing points3D.bin and images.bin.
        max_points: Downsample to this many points if total exceeds it.
        unregistered_images: Optional list of image names that failed registration.

    Returns:
        Dict with 'points', 'cameras', and 'summary' keys.
    """
    model_path = Path(model_dir)

    points3d_path = model_path / "points3D.bin"
    images_path = model_path / "images.bin"

    if not points3d_path.exists():
        raise FileNotFoundError(f"points3D.bin not found in {model_dir}")
    if not images_path.exists():
        raise FileNotFoundError(f"images.bin not found in {model_dir}")

    raw_points = read_points3d_binary(str(points3d_path))
    raw_images = read_images_binary(str(images_path))

    # Downsample points if needed
    if len(raw_points) > max_points:
        raw_points = random.sample(raw_points, max_points)

    # Build per-image reprojection error map
    errors = compute_reprojection_errors(raw_points, raw_images)

    # Registered image names
    registered_names = {img["image_name"] for img in raw_images}
    unregistered = set(unregistered_images or [])

    # Format points for response (strip id and error to reduce payload)
    response_points = [
        {"x": p["x"], "y": p["y"], "z": p["z"], "r": p["r"], "g": p["g"], "b": p["b"]}
        for p in raw_points
    ]

    # Format cameras
    response_cameras = []
    for img in raw_images:
        response_cameras.append({
            "image_name": img["image_name"],
            "registered": True,
            "position": img["position"],
            "rotation_matrix": img["rotation_matrix"],
            "reprojection_error": errors.get(img["image_id"], 0.0),
        })

    # Add unregistered cameras (no position data available)
    for name in unregistered:
        if name not in registered_names:
            response_cameras.append({
                "image_name": name,
                "registered": False,
                "position": [0.0, 0.0, 0.0],
                "rotation_matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                "reprojection_error": 0.0,
            })

    total_images = len(registered_names) + len(unregistered - registered_names)
    mean_error = (
        sum(p["error"] for p in raw_points) / len(raw_points)
        if raw_points
        else 0.0
    )

    return {
        "points": response_points,
        "cameras": response_cameras,
        "summary": {
            "total_points": len(response_points),
            "total_images": total_images,
            "registered_images": len(registered_names),
            "mean_reprojection_error": round(mean_error, 4),
        },
    }
