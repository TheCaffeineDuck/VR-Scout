#!/usr/bin/env python3
"""Validate exported .glb meshes for QC checks.

Checks:
  - Triangle count within expected range
  - File size within targets
  - Has vertex colors
  - No degenerate triangles
  - Bounding box reasonable

Usage:
    python validate_scene.py scene.glb
    python validate_scene.py scene_preview.glb --lod preview
    python validate_scene.py scene_high.glb --lod high
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import trimesh


# Size and triangle limits per LOD level
LOD_LIMITS = {
    "preview": {"min_faces": 10_000, "max_faces": 150_000, "max_size_mb": 10},
    "medium": {"min_faces": 100_000, "max_faces": 750_000, "max_size_mb": 30},
    "high": {"min_faces": 500_000, "max_faces": 6_000_000, "max_size_mb": 200},
    "any": {"min_faces": 1, "max_faces": 10_000_000, "max_size_mb": 500},
}


class Check:
    def __init__(self, name: str) -> None:
        self.name = name
        self.passed = False
        self.detail = ""

    def pass_(self, detail: str = "") -> None:
        self.passed = True
        self.detail = detail

    def fail(self, detail: str) -> None:
        self.passed = False
        self.detail = detail

    def __str__(self) -> str:
        icon = "PASS" if self.passed else "FAIL"
        msg = f"  [{icon}] {self.name}"
        if self.detail:
            msg += f" -- {self.detail}"
        return msg


def validate(filepath: str, lod: str = "any") -> list[Check]:
    """Run all QC checks on a .glb file."""
    path = Path(filepath)
    limits = LOD_LIMITS[lod]
    checks: list[Check] = []

    # --- Check 1: File exists and is readable ---
    c = Check("File readable")
    if not path.exists():
        c.fail(f"{path} not found")
        checks.append(c)
        return checks  # Can't proceed
    c.pass_(f"{path.name}")
    checks.append(c)

    # --- Check 2: File size ---
    c = Check("File size within target")
    size_mb = path.stat().st_size / (1024 * 1024)
    max_mb = limits["max_size_mb"]
    if size_mb > max_mb:
        c.fail(f"{size_mb:.1f} MB > {max_mb} MB limit for {lod}")
    else:
        c.pass_(f"{size_mb:.1f} MB (limit: {max_mb} MB)")
    checks.append(c)

    # --- Load mesh ---
    try:
        scene = trimesh.load(filepath, force="mesh")
        if isinstance(scene, trimesh.Scene):
            scene = scene.dump(concatenate=True)
        mesh = scene
    except Exception as e:
        c = Check("Mesh loadable")
        c.fail(str(e))
        checks.append(c)
        return checks

    c = Check("Mesh loadable")
    c.pass_(f"{len(mesh.vertices):,} vertices, {len(mesh.faces):,} faces")
    checks.append(c)

    # --- Check 3: Triangle count ---
    c = Check("Triangle count in range")
    n_faces = len(mesh.faces)
    min_f = limits["min_faces"]
    max_f = limits["max_faces"]
    if n_faces < min_f:
        c.fail(f"{n_faces:,} < {min_f:,} minimum for {lod}")
    elif n_faces > max_f:
        c.fail(f"{n_faces:,} > {max_f:,} maximum for {lod}")
    else:
        c.pass_(f"{n_faces:,} faces (range: {min_f:,}-{max_f:,})")
    checks.append(c)

    # --- Check 4: Has vertex colors ---
    c = Check("Has vertex colors")
    has_colors = (
        mesh.visual is not None
        and hasattr(mesh.visual, "vertex_colors")
        and mesh.visual.vertex_colors is not None
        and len(mesh.visual.vertex_colors) == len(mesh.vertices)
    )
    if has_colors:
        colors = np.asarray(mesh.visual.vertex_colors)
        unique_count = len(np.unique(colors.reshape(-1, colors.shape[-1]), axis=0))
        c.pass_(f"{unique_count:,} unique colors")
    else:
        c.fail("No per-vertex color data found")
    checks.append(c)

    # --- Check 5: No degenerate triangles ---
    c = Check("No degenerate triangles")
    # A degenerate triangle has zero area (vertices are collinear or coincident)
    cross = np.cross(
        mesh.vertices[mesh.faces[:, 1]] - mesh.vertices[mesh.faces[:, 0]],
        mesh.vertices[mesh.faces[:, 2]] - mesh.vertices[mesh.faces[:, 0]],
    )
    areas = np.linalg.norm(cross, axis=1) * 0.5
    n_degenerate = int(np.sum(areas < 1e-10))
    ratio = n_degenerate / n_faces * 100 if n_faces > 0 else 0
    if ratio > 1.0:
        c.fail(f"{n_degenerate:,} degenerate ({ratio:.2f}% of faces)")
    elif n_degenerate > 0:
        c.pass_(f"{n_degenerate:,} degenerate ({ratio:.4f}% -- acceptable)")
    else:
        c.pass_("0 degenerate triangles")
    checks.append(c)

    # --- Check 6: Bounding box reasonable ---
    c = Check("Bounding box reasonable")
    bounds = mesh.bounds
    extent = bounds[1] - bounds[0]
    max_extent = float(np.max(extent))
    min_extent = float(np.min(extent))

    if max_extent > 10000:
        c.fail(f"Max extent {max_extent:.1f} > 10000 (scene too large)")
    elif max_extent < 0.01:
        c.fail(f"Max extent {max_extent:.6f} < 0.01 (scene too small)")
    elif min_extent < 0.001:
        c.fail(f"Min extent {min_extent:.6f} -- scene may be flat")
    else:
        c.pass_(
            f"Extent: [{extent[0]:.1f}, {extent[1]:.1f}, {extent[2]:.1f}]"
        )
    checks.append(c)

    # --- Check 7: No NaN/Inf in vertex positions ---
    c = Check("No NaN/Inf in vertices")
    verts = np.asarray(mesh.vertices)
    has_nan = np.any(np.isnan(verts))
    has_inf = np.any(np.isinf(verts))
    if has_nan or has_inf:
        n_bad = int(np.sum(np.isnan(verts) | np.isinf(verts)))
        c.fail(f"{n_bad} NaN/Inf values found in vertex data")
    else:
        c.pass_("All vertex positions are finite")
    checks.append(c)

    return checks


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate .glb mesh for QC")
    parser.add_argument("input", help="Input .glb file to validate")
    parser.add_argument(
        "--lod",
        choices=["preview", "medium", "high", "any"],
        default="any",
        help="LOD level for size/count validation (default: any)",
    )
    args = parser.parse_args()

    print(f"Validating: {args.input} (LOD: {args.lod})")
    print()

    checks = validate(args.input, args.lod)

    for c in checks:
        print(c)

    passed = sum(1 for c in checks if c.passed)
    total = len(checks)
    print()
    print(f"Result: {passed}/{total} checks passed")

    if passed == total:
        print("STATUS: ALL CHECKS PASSED")
        sys.exit(0)
    else:
        print("STATUS: SOME CHECKS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
