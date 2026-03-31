"""Panorama processing utilities for equirectangular images."""

from __future__ import annotations

from pathlib import Path


async def split_equirectangular(
    image_path: Path,
    output_dir: Path,
) -> list[Path]:
    """Split an equirectangular panorama into six cube-map face images."""
    return []


async def register_cubemap_faces(
    faces: list[Path],
    model_path: Path,
) -> bool:
    """Register cube-map face images into an existing SfM model."""
    return False
