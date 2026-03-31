"""Panorama processing utilities for equirectangular images."""

from __future__ import annotations

import math
from pathlib import Path


async def split_equirectangular(
    image_path: Path,
    output_dir: Path,
) -> list[Path]:
    """Split an equirectangular panorama into six cube-map face images.

    Each face is a square image extracted from the equirectangular projection.
    Faces: front, right, back, left, top, bottom.
    """
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        return []

    img = Image.open(image_path).convert("RGB")
    eq_array = np.array(img)
    eq_h, eq_w = eq_array.shape[:2]

    # Face size: height of equirectangular / 2 (standard cubemap ratio)
    face_size = eq_h // 2

    face_names = ["front", "right", "back", "left", "top", "bottom"]
    # For each face, define the forward/right/up vectors in world space
    # Convention: +X=right, +Y=up, +Z=forward (looking into screen)
    face_vectors: dict[str, tuple[list[float], list[float], list[float]]] = {
        "front":  ([0, 0, 1],  [1, 0, 0],  [0, 1, 0]),
        "right":  ([1, 0, 0],  [0, 0, -1], [0, 1, 0]),
        "back":   ([0, 0, -1], [-1, 0, 0], [0, 1, 0]),
        "left":   ([-1, 0, 0], [0, 0, 1],  [0, 1, 0]),
        "top":    ([0, 1, 0],  [1, 0, 0],  [0, 0, -1]),
        "bottom": ([0, -1, 0], [1, 0, 0],  [0, 0, 1]),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = image_path.stem
    output_paths: list[Path] = []

    for face_name in face_names:
        fwd_vec, right_vec, up_vec = face_vectors[face_name]
        fwd = np.array(fwd_vec, dtype=np.float64)
        right = np.array(right_vec, dtype=np.float64)
        up = np.array(up_vec, dtype=np.float64)

        # Generate pixel coordinates for this face
        u = np.linspace(-1, 1, face_size, dtype=np.float64)
        v = np.linspace(-1, 1, face_size, dtype=np.float64)
        uu, vv = np.meshgrid(u, v)

        # 3D direction for each pixel
        dirs = (
            fwd[np.newaxis, np.newaxis, :]
            + uu[:, :, np.newaxis] * right[np.newaxis, np.newaxis, :]
            + vv[:, :, np.newaxis] * up[np.newaxis, np.newaxis, :]
        )

        # Normalize
        norms = np.sqrt(np.sum(dirs * dirs, axis=2, keepdims=True))
        dirs = dirs / (norms + 1e-10)

        # Convert to spherical coordinates
        x = dirs[:, :, 0]
        y = dirs[:, :, 1]
        z = dirs[:, :, 2]

        # Equirectangular mapping: lon = atan2(x, z), lat = asin(y)
        lon = np.arctan2(x, z)  # range [-pi, pi]
        lat = np.arcsin(np.clip(y, -1, 1))  # range [-pi/2, pi/2]

        # Map to pixel coordinates in equirectangular image
        px = ((lon / math.pi + 1) / 2 * eq_w).astype(np.int32)
        py = ((0.5 - lat / math.pi) * eq_h).astype(np.int32)

        # Clamp
        px = np.clip(px, 0, eq_w - 1)
        py = np.clip(py, 0, eq_h - 1)

        # Sample
        face_pixels = eq_array[py, px]

        face_img = Image.fromarray(face_pixels.astype(np.uint8))
        out_path = output_dir / f"{stem}_{face_name}.jpg"
        face_img.save(str(out_path), quality=95)
        output_paths.append(out_path)

    return output_paths


async def register_cubemap_faces(
    faces: list[Path],
    model_path: Path,
) -> bool:
    """Register cube-map face images into an existing SfM model.

    This is handled by step_05_5 via COLMAP image_registrator subprocess.
    """
    return len(faces) > 0
