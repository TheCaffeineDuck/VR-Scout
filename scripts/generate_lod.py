#!/usr/bin/env python3
"""Generate LOD (Level of Detail) variants from a high-quality mesh.

Reads a .glb or .off file and produces three LOD levels via
quadric decimation:
  - preview: 50K-100K triangles (instant load)
  - medium:  200K-500K triangles (WiFi/5G)
  - high:    original or capped at 5M triangles (full VR)

All outputs get Draco compression if gltf-transform is available.

Usage:
    python generate_lod.py scene.glb --output-dir ./lods/
    python generate_lod.py scene.off --output-dir ./lods/
"""

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import trimesh


# LOD level definitions: (name, target_faces, max_faces)
LOD_LEVELS = [
    ("preview", 75_000, 100_000),
    ("medium", 350_000, 500_000),
    ("high", 5_000_000, 5_000_000),
]


def load_mesh(filepath: str) -> trimesh.Trimesh:
    """Load a mesh from .glb or .off file."""
    path = Path(filepath)
    ext = path.suffix.lower()

    if ext == ".off":
        # Use our COFF parser for .off files with per-face colors
        from convert_scene import parse_coff

        vertices, faces, face_colors = parse_coff(filepath)
        vertex_colors = np.zeros((len(vertices), 4), dtype=np.uint8)
        vertex_colors[faces[:, 0]] = face_colors
        vertex_colors[faces[:, 1]] = face_colors
        vertex_colors[faces[:, 2]] = face_colors
        return trimesh.Trimesh(
            vertices=vertices,
            faces=faces,
            vertex_colors=vertex_colors,
            process=False,
        )
    elif ext in (".glb", ".gltf"):
        scene = trimesh.load(filepath, force="mesh")
        if isinstance(scene, trimesh.Scene):
            scene = scene.dump(concatenate=True)
        return scene
    else:
        raise ValueError(f"Unsupported format: {ext}")


def decimate(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    """Decimate mesh to target face count using quadric decimation."""
    import fast_simplification

    if len(mesh.faces) <= target_faces:
        print(f"    Mesh already has {len(mesh.faces):,} faces (<= {target_faces:,}), skipping decimation")
        return mesh

    print(f"    Decimating {len(mesh.faces):,} -> {target_faces:,} faces...")
    t0 = time.time()

    # Use fast_simplification directly with target_count
    verts_out, faces_out = fast_simplification.simplify(
        points=np.asarray(mesh.vertices, dtype=np.float64),
        triangles=np.asarray(mesh.faces, dtype=np.int32),
        target_count=target_faces,
    )

    # Rebuild vertex colors by nearest-vertex lookup from original mesh
    if mesh.visual and hasattr(mesh.visual, "vertex_colors"):
        from scipy.spatial import cKDTree

        tree = cKDTree(mesh.vertices)
        _, indices = tree.query(verts_out)
        new_colors = np.asarray(mesh.visual.vertex_colors)[indices]
    else:
        new_colors = None

    decimated = trimesh.Trimesh(
        vertices=verts_out,
        faces=faces_out,
        vertex_colors=new_colors,
        process=False,
    )

    elapsed = time.time() - t0
    print(f"    Result: {len(decimated.faces):,} faces in {elapsed:.1f}s")
    return decimated


def apply_draco(input_path: Path, output_path: Path) -> bool:
    """Apply Draco compression via gltf-transform. Returns True on success."""
    npx_cmd = shutil.which("npx") or "npx"
    try:
        result = subprocess.run(
            [npx_cmd, "--yes", "@gltf-transform/cli", "draco", str(input_path), str(output_path)],
            capture_output=True,
            text=True,
            timeout=300,
            shell=(sys.platform == "win32"),
        )
        if result.returncode == 0:
            return True
        print(f"    Draco failed: {result.stderr.strip()}", file=sys.stderr)
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"    Draco unavailable: {e}", file=sys.stderr)
    return False


def generate_lods(input_path: str, output_dir: str) -> None:
    """Generate all LOD levels from input mesh."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    base_name = Path(input_path).stem

    print(f"Loading source mesh: {input_path}")
    mesh = load_mesh(input_path)
    print(f"  Source: {len(mesh.faces):,} faces, {len(mesh.vertices):,} vertices")

    for level_name, target, max_faces in LOD_LEVELS:
        print(f"\n--- {level_name.upper()} LOD ---")

        if level_name == "high" and len(mesh.faces) <= max_faces:
            lod_mesh = mesh
            print(f"  Using original mesh ({len(mesh.faces):,} faces)")
        elif level_name == "high":
            lod_mesh = decimate(mesh, max_faces)
        else:
            lod_mesh = decimate(mesh, target)

        # Export uncompressed first
        raw_path = out / f"{base_name}_{level_name}.glb"
        draco_path = out / f"{base_name}_{level_name}_draco.glb"

        print(f"  Exporting {raw_path.name}...")
        lod_mesh.export(str(raw_path), file_type="glb")
        raw_mb = raw_path.stat().st_size / (1024 * 1024)
        print(f"  Raw size: {raw_mb:.1f} MB")

        # Try Draco compression
        if apply_draco(raw_path, draco_path):
            draco_mb = draco_path.stat().st_size / (1024 * 1024)
            ratio = (1 - draco_mb / raw_mb) * 100 if raw_mb > 0 else 0
            print(f"  Draco size: {draco_mb:.1f} MB ({ratio:.0f}% reduction)")
            # Replace raw with Draco version
            raw_path.unlink()
            draco_path.rename(raw_path)
        else:
            print("  Keeping uncompressed version.")
            if draco_path.exists():
                draco_path.unlink()

        final_mb = raw_path.stat().st_size / (1024 * 1024)
        print(f"  Final: {raw_path.name} ({final_mb:.1f} MB, {len(lod_mesh.faces):,} faces)")

    print(f"\nAll LODs written to {out}/")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate LOD mesh variants")
    parser.add_argument("input", help="Input .glb or .off file")
    parser.add_argument(
        "--output-dir",
        default="./lods/",
        help="Output directory (default: ./lods/)",
    )
    args = parser.parse_args()

    inp = Path(args.input)
    if not inp.exists():
        print(f"Error: {inp} not found", file=sys.stderr)
        sys.exit(1)

    generate_lods(args.input, args.output_dir)


if __name__ == "__main__":
    main()
