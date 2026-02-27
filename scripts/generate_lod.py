#!/usr/bin/env python3
"""Generate LOD (Level of Detail) variants from a high-quality mesh.

Reads a .glb or .ply file and produces three LOD levels via
quadric decimation:
  - preview: 75K triangles (instant load)
  - medium:  200K triangles (WiFi/5G)
  - high:    500K triangles (full VR)

All outputs get meshopt compression via gltfpack if available.

Usage:
    python generate_lod.py scene.glb --output-dir ./lods/
    python generate_lod.py scene.ply --output-dir ./lods/
    python generate_lod.py scene.ply --output-dir ./lods/ --location-id office --version v2
"""

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import trimesh


# LOD level definitions: (suffix, target_faces)
LOD_LEVELS = [
    ("preview", 75_000),
    ("medium", 200_000),
    ("high", 500_000),
]


def load_mesh(filepath: str) -> trimesh.Trimesh:
    """Load a mesh from .glb, .gltf, or .ply file."""
    path = Path(filepath)
    ext = path.suffix.lower()

    print(f"Loading {filepath}...")
    t0 = time.time()

    if ext == ".ply":
        mesh = trimesh.load(filepath, process=False)
    elif ext in (".glb", ".gltf"):
        mesh = trimesh.load(filepath, force="mesh")
    else:
        raise ValueError(f"Unsupported format: {ext} (expected .ply, .glb, or .gltf)")

    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.dump(concatenate=True)

    if not isinstance(mesh, trimesh.Trimesh):
        raise ValueError(f"Could not load {filepath} as a triangle mesh")

    elapsed = time.time() - t0
    print(f"  Loaded in {elapsed:.1f}s")
    return mesh


def decimate(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    """Decimate mesh to target face count using quadric decimation."""
    if len(mesh.faces) <= target_faces:
        print(f"    Mesh already has {len(mesh.faces):,} faces (<= {target_faces:,}), skipping decimation")
        return mesh

    print(f"    Decimating {len(mesh.faces):,} -> {target_faces:,} faces...")
    t0 = time.time()

    try:
        decimated = mesh.simplify_quadric_decimation(target_faces)
    except AttributeError:
        # Fallback for trimesh versions without built-in quadric decimation
        import fast_simplification
        from scipy.spatial import cKDTree

        verts_out, faces_out = fast_simplification.simplify(
            points=np.asarray(mesh.vertices, dtype=np.float64),
            triangles=np.asarray(mesh.faces, dtype=np.int32),
            target_count=target_faces,
        )

        new_colors = None
        if mesh.visual and hasattr(mesh.visual, "vertex_colors") and mesh.visual.vertex_colors is not None:
            tree = cKDTree(mesh.vertices)
            _, indices = tree.query(verts_out)
            new_colors = np.asarray(mesh.visual.vertex_colors)[indices]

        decimated = trimesh.Trimesh(
            vertices=verts_out,
            faces=faces_out,
            vertex_colors=new_colors,
            process=False,
        )

    elapsed = time.time() - t0
    print(f"    Result: {len(decimated.faces):,} faces in {elapsed:.1f}s")
    return decimated


def apply_meshopt(input_path: Path, output_path: Path) -> bool:
    """Apply meshopt compression via gltfpack. Returns True on success."""
    gltfpack_cmd = shutil.which("gltfpack")
    if gltfpack_cmd is None:
        return False

    try:
        result = subprocess.run(
            [gltfpack_cmd, "-i", str(input_path), "-o", str(output_path), "-cc", "-noq"],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode == 0:
            return True
        print(f"    gltfpack failed: {result.stderr.strip()}", file=sys.stderr)
    except subprocess.TimeoutExpired:
        print("    gltfpack timed out.", file=sys.stderr)
    return False


def generate_lods(
    input_path: str,
    output_dir: str,
    location_id: str = "scene",
    version: str = "v1",
    no_meshopt: bool = False,
) -> None:
    """Generate all LOD levels from input mesh."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    mesh = load_mesh(input_path)
    print(f"  Source: {len(mesh.faces):,} faces, {len(mesh.vertices):,} vertices")

    for suffix, target_faces in LOD_LEVELS:
        print(f"\n--- {suffix.upper()} LOD ({target_faces:,} faces max) ---")

        lod_mesh = decimate(mesh, target_faces)

        filename = f"{location_id}_mesh_{suffix}_{version}.glb"
        lod_path = out / filename

        # Export (with optional meshopt compression)
        if no_meshopt:
            raw_path = lod_path
        else:
            raw_path = lod_path.with_name(lod_path.stem + "_uncompressed.glb")

        print(f"  Exporting {raw_path.name}...")
        lod_mesh.export(str(raw_path), file_type="glb")
        raw_mb = raw_path.stat().st_size / (1024 * 1024)
        print(f"  Raw size: {raw_mb:.1f} MB")

        if not no_meshopt:
            if apply_meshopt(raw_path, lod_path):
                compressed_mb = lod_path.stat().st_size / (1024 * 1024)
                ratio = (1 - compressed_mb / raw_mb) * 100 if raw_mb > 0 else 0
                print(f"  Compressed: {compressed_mb:.1f} MB ({ratio:.0f}% reduction)")
                raw_path.unlink()
            else:
                print("  WARNING: gltfpack not found — keeping uncompressed.", file=sys.stderr)
                if raw_path != lod_path:
                    raw_path.rename(lod_path)

        final_mb = lod_path.stat().st_size / (1024 * 1024)
        print(f"  Final: {lod_path.name} ({final_mb:.1f} MB, {len(lod_mesh.faces):,} faces)")

    print(f"\nAll LODs written to {out}/")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate LOD mesh variants for VR Scout")
    parser.add_argument("input", help="Input .glb or .ply file")
    parser.add_argument(
        "--output-dir",
        default="./lods/",
        help="Output directory (default: ./lods/)",
    )
    parser.add_argument(
        "--location-id",
        default="scene",
        help="Location ID for LOD filenames (default: scene)",
    )
    parser.add_argument(
        "--version",
        default="v1",
        help="Version string for LOD filenames (default: v1)",
    )
    parser.add_argument(
        "--no-meshopt",
        action="store_true",
        help="Skip meshopt compression",
    )
    args = parser.parse_args()

    inp = Path(args.input)
    if not inp.exists():
        print(f"Error: {inp} not found", file=sys.stderr)
        sys.exit(1)

    generate_lods(
        args.input,
        args.output_dir,
        location_id=args.location_id,
        version=args.version,
        no_meshopt=args.no_meshopt,
    )


if __name__ == "__main__":
    main()
