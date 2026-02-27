#!/usr/bin/env python3
"""Convert .ply files from MeshSplatting to .glb format.

MeshSplatting exports connected opaque meshes as .ply files with faces
and RGB vertex colors. This script converts them to .glb with optional
meshopt compression via gltfpack, and can generate multiple LOD variants.

Usage:
    python convert_scene.py input.ply output.glb
    python convert_scene.py input.ply output.glb --no-meshopt
    python convert_scene.py input.ply output.glb --lods --location-id office --version v2
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


def load_ply(filepath: str) -> trimesh.Trimesh:
    """Load a .ply mesh with vertex colors via trimesh.

    Returns a Trimesh with vertices, faces, and vertex colors preserved.
    """
    print(f"Loading {filepath}...")
    t0 = time.time()

    mesh = trimesh.load(filepath, process=False)

    # If trimesh returns a Scene (multi-object .ply), concatenate into one mesh
    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.dump(concatenate=True)

    if not isinstance(mesh, trimesh.Trimesh):
        raise ValueError(f"Could not load {filepath} as a triangle mesh")

    elapsed = time.time() - t0
    print(f"  Loaded in {elapsed:.1f}s")
    print(f"  Vertices: {len(mesh.vertices):,}")
    print(f"  Faces:    {len(mesh.faces):,}")

    # Check for vertex colors
    has_colors = (
        mesh.visual is not None
        and hasattr(mesh.visual, "vertex_colors")
        and mesh.visual.vertex_colors is not None
        and len(mesh.visual.vertex_colors) == len(mesh.vertices)
    )
    print(f"  Has vertex colors: {has_colors}")

    if not has_colors:
        print("  WARNING: No vertex colors found — output will be uncolored", file=sys.stderr)

    return mesh


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
        print(f"  gltfpack failed: {result.stderr.strip()}", file=sys.stderr)
    except subprocess.TimeoutExpired:
        print("  gltfpack timed out.", file=sys.stderr)
    return False


def decimate_mesh(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    """Decimate mesh to target face count using quadric decimation."""
    if len(mesh.faces) <= target_faces:
        print(f"    Mesh already has {len(mesh.faces):,} faces (<= {target_faces:,}), skipping decimation")
        return mesh

    print(f"    Decimating {len(mesh.faces):,} -> {target_faces:,} faces...")
    t0 = time.time()

    try:
        decimated = mesh.simplify_quadric_decimation(target_faces)
    except AttributeError:
        # Fallback: some trimesh versions use a different API
        print("    WARNING: simplify_quadric_decimation not available, trying fast_simplification...", file=sys.stderr)
        import fast_simplification
        from scipy.spatial import cKDTree

        verts_out, faces_out = fast_simplification.simplify(
            points=np.asarray(mesh.vertices, dtype=np.float64),
            triangles=np.asarray(mesh.faces, dtype=np.int32),
            target_count=target_faces,
        )

        # Rebuild vertex colors by nearest-vertex lookup
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


def export_glb(mesh: trimesh.Trimesh, output_path: Path, meshopt: bool = True) -> None:
    """Export mesh to .glb with optional meshopt compression."""
    if meshopt:
        temp_path = output_path.with_name(output_path.stem + "_uncompressed.glb")
    else:
        temp_path = output_path

    print(f"  Exporting to {temp_path.name}...")
    mesh.export(str(temp_path), file_type="glb")

    raw_mb = temp_path.stat().st_size / (1024 * 1024)
    print(f"  Raw size: {raw_mb:.1f} MB")

    if meshopt:
        print("  Applying meshopt compression via gltfpack...")
        if apply_meshopt(temp_path, output_path):
            compressed_mb = output_path.stat().st_size / (1024 * 1024)
            ratio = (1 - compressed_mb / raw_mb) * 100 if raw_mb > 0 else 0
            print(f"  Compressed: {compressed_mb:.1f} MB ({ratio:.0f}% reduction)")
            temp_path.unlink()
        else:
            print("  WARNING: gltfpack not found — output will be uncompressed.", file=sys.stderr)
            print("  Install gltfpack: https://github.com/zeux/meshoptimizer", file=sys.stderr)
            if temp_path != output_path:
                temp_path.rename(output_path)

    final_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"  Final: {output_path.name} ({final_mb:.1f} MB)")


def convert(input_path: str, output_path: str, meshopt: bool = True) -> None:
    """Convert .ply to .glb with optional meshopt compression."""
    mesh = load_ply(input_path)

    # Print bounds info
    bounds = mesh.bounds
    extent = bounds[1] - bounds[0]
    print(f"  Bounds min: [{bounds[0][0]:.1f}, {bounds[0][1]:.1f}, {bounds[0][2]:.1f}]")
    print(f"  Bounds max: [{bounds[1][0]:.1f}, {bounds[1][1]:.1f}, {bounds[1][2]:.1f}]")
    print(f"  Extent:     [{extent[0]:.1f}, {extent[1]:.1f}, {extent[2]:.1f}]")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    export_glb(mesh, output, meshopt=meshopt)

    print(f"\nDone! {output}")


def generate_lods(
    input_path: str,
    output_dir: str,
    location_id: str = "scene",
    version: str = "v1",
    meshopt: bool = True,
) -> None:
    """Generate LOD variants from input mesh."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    print(f"Loading source mesh: {input_path}")
    mesh = load_ply(input_path)
    print(f"  Source: {len(mesh.faces):,} faces, {len(mesh.vertices):,} vertices")

    for suffix, target_faces in LOD_LEVELS:
        print(f"\n--- {suffix.upper()} LOD ({target_faces:,} faces max) ---")

        lod_mesh = decimate_mesh(mesh, target_faces)

        filename = f"{location_id}_mesh_{suffix}_{version}.glb"
        lod_path = out / filename

        export_glb(lod_mesh, lod_path, meshopt=meshopt)

    print(f"\nAll LODs written to {out}/")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert .ply (MeshSplatting) to .glb for VR Scout"
    )
    parser.add_argument("input", help="Input .ply file")
    parser.add_argument("output", help="Output .glb file")
    parser.add_argument(
        "--no-meshopt",
        action="store_true",
        help="Skip meshopt compression (default: compress with gltfpack)",
    )
    parser.add_argument(
        "--lods",
        action="store_true",
        help="Generate LOD variants (preview/medium/high) in addition to main output",
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

    args = parser.parse_args()

    inp = Path(args.input)
    if not inp.exists():
        print(f"Error: {inp} not found", file=sys.stderr)
        sys.exit(1)

    if inp.suffix.lower() != ".ply":
        print(f"Warning: {inp} does not have .ply extension", file=sys.stderr)

    meshopt = not args.no_meshopt

    # Main conversion
    convert(args.input, args.output, meshopt=meshopt)

    # Optional LOD generation
    if args.lods:
        lod_dir = Path(args.output).parent
        print(f"\n{'='*50}")
        print("Generating LOD variants...")
        print(f"{'='*50}")
        generate_lods(
            args.input,
            str(lod_dir),
            location_id=args.location_id,
            version=args.version,
            meshopt=meshopt,
        )


if __name__ == "__main__":
    main()
