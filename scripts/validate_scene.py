#!/usr/bin/env python3
"""Validate .glb meshes for MeshSplatting QC checks.

Checks:
  - Has vertex colors (required for MeshSplatting output)
  - Face count within budget (warn if >500K for VR)
  - No degenerate triangles (area > 0)
  - Bounding box is reasonable (not NaN, not infinite)

Prints a summary: vertices, faces, file size, bounding box dimensions,
vertex color range.

Usage:
    python validate_scene.py scene.glb
    python validate_scene.py scene.glb --lod preview
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import trimesh


# VR triangle budget
MAX_VR_TRIANGLES = 500_000

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


def validate(filepath: str, lod: str = "any") -> tuple[list[Check], dict]:
    """Run all QC checks on a .glb file.

    Returns (checks, summary) where summary contains mesh stats for display.
    """
    path = Path(filepath)
    limits = LOD_LIMITS[lod]
    checks: list[Check] = []
    summary: dict = {}

    # --- Check 1: File exists and is readable ---
    c = Check("File readable")
    if not path.exists():
        c.fail(f"{path} not found")
        checks.append(c)
        return checks, summary
    size_mb = path.stat().st_size / (1024 * 1024)
    summary["file_size_mb"] = size_mb
    c.pass_(f"{path.name}")
    checks.append(c)

    # --- Check 2: File size ---
    c = Check("File size within target")
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
        return checks, summary

    c = Check("Mesh loadable")
    c.pass_(f"{len(mesh.vertices):,} vertices, {len(mesh.faces):,} faces")
    checks.append(c)

    n_faces = len(mesh.faces)
    summary["vertices"] = len(mesh.vertices)
    summary["faces"] = n_faces

    # --- Check 3: Has vertex colors (required for MeshSplatting) ---
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
        # Compute color range for summary (RGB channels only)
        rgb = colors[:, :3].astype(np.float64)
        summary["color_min"] = rgb.min(axis=0).tolist()
        summary["color_max"] = rgb.max(axis=0).tolist()
        summary["color_mean"] = rgb.mean(axis=0).tolist()
    else:
        c.fail("No per-vertex color data found (required for MeshSplatting output)")
    checks.append(c)

    # --- Check 4: Face count within budget ---
    c = Check("Face count in range")
    min_f = limits["min_faces"]
    max_f = limits["max_faces"]
    if n_faces < min_f:
        c.fail(f"{n_faces:,} < {min_f:,} minimum for {lod}")
    elif n_faces > max_f:
        c.fail(f"{n_faces:,} > {max_f:,} maximum for {lod}")
    else:
        c.pass_(f"{n_faces:,} faces (range: {min_f:,}-{max_f:,})")
    checks.append(c)

    # Warn if over VR budget (separate from pass/fail)
    if n_faces > MAX_VR_TRIANGLES:
        summary["vr_budget_warning"] = True

    # --- Check 5: No degenerate triangles ---
    c = Check("No degenerate triangles")
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

    summary["bounds_min"] = bounds[0].tolist()
    summary["bounds_max"] = bounds[1].tolist()
    summary["extent"] = extent.tolist()

    if np.any(np.isnan(bounds)) or np.any(np.isinf(bounds)):
        c.fail("Bounding box contains NaN or Inf")
    elif max_extent > 10000:
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

    return checks, summary


def print_summary(summary: dict) -> None:
    """Print a human-readable summary of mesh statistics."""
    print("\n--- SUMMARY ---")

    if "vertices" in summary:
        print(f"  Vertices:       {summary['vertices']:,}")
    if "faces" in summary:
        print(f"  Faces:          {summary['faces']:,}")
    if "file_size_mb" in summary:
        print(f"  File size:      {summary['file_size_mb']:.1f} MB")
    if "extent" in summary:
        ext = summary["extent"]
        print(f"  Bounding box:   [{ext[0]:.1f} x {ext[1]:.1f} x {ext[2]:.1f}]")
    if "bounds_min" in summary and "bounds_max" in summary:
        mn = summary["bounds_min"]
        mx = summary["bounds_max"]
        print(f"    Min:          [{mn[0]:.1f}, {mn[1]:.1f}, {mn[2]:.1f}]")
        print(f"    Max:          [{mx[0]:.1f}, {mx[1]:.1f}, {mx[2]:.1f}]")
    if "color_min" in summary:
        cmin = summary["color_min"]
        cmax = summary["color_max"]
        cmean = summary["color_mean"]
        print(f"  Vertex colors:  R[{cmin[0]:.0f}-{cmax[0]:.0f}] "
              f"G[{cmin[1]:.0f}-{cmax[1]:.0f}] "
              f"B[{cmin[2]:.0f}-{cmax[2]:.0f}]")
        print(f"    Mean RGB:     ({cmean[0]:.0f}, {cmean[1]:.0f}, {cmean[2]:.0f})")
    if summary.get("vr_budget_warning"):
        print(f"  VR WARNING:     Face count exceeds VR budget of {MAX_VR_TRIANGLES:,}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate .glb mesh for MeshSplatting QC")
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

    checks, summary = validate(args.input, args.lod)

    print("Checks:")
    for c in checks:
        print(c)

    print_summary(summary)

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
