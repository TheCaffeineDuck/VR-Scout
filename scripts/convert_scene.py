#!/usr/bin/env python3
"""Convert .off (COFF) files from Triangle Splatting to .glb format.

Triangle Splatting exports colored triangle meshes as .off (COFF) files
with per-face RGBA colors. This script converts them to .glb with
per-vertex colors for use in Three.js / WebGPU.

Usage:
    python convert_scene.py input.off output.glb
    python convert_scene.py input.off output.glb --draco
"""

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import trimesh


def parse_coff(filepath: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Parse a COFF (.off with per-face colors) file.

    Format:
        COFF
        num_vertices num_faces 0
        x y z              (one line per vertex)
        3 v0 v1 v2 r g b a (one line per face)

    Returns:
        vertices:    (N, 3) float32 positions
        faces:       (M, 3) int32 triangle indices
        face_colors: (M, 4) uint8 RGBA per-face colors
    """
    print(f"Parsing {filepath}...")
    t0 = time.time()

    with open(filepath, "r") as f:
        header = f.readline().strip()
        if header not in ("OFF", "COFF"):
            raise ValueError(f"Expected OFF/COFF header, got: {header}")

        parts = f.readline().strip().split()
        num_vertices = int(parts[0])
        num_faces = int(parts[1])

    print(f"  Vertices: {num_vertices:,}")
    print(f"  Faces:    {num_faces:,}")
    print(f"  Triangles: {num_faces:,}")

    # Read vertex positions (3 float columns, skip 2 header lines)
    print("  Reading vertices...")
    vertices = np.loadtxt(
        filepath, skiprows=2, max_rows=num_vertices, dtype=np.float32
    )
    if vertices.ndim == 1:
        vertices = vertices.reshape(-1, 3)

    # Read face data (skip header + vertices)
    # Each line: 3 v0 v1 v2 r g b a  →  8 integer columns
    print("  Reading faces...")
    face_data = np.loadtxt(
        filepath, skiprows=2 + num_vertices, max_rows=num_faces, dtype=np.int64
    )
    if face_data.ndim == 1:
        face_data = face_data.reshape(-1, face_data.shape[0])

    faces = face_data[:, 1:4].astype(np.int32)

    # Extract per-face colors
    ncols = face_data.shape[1]
    if ncols >= 8:
        face_colors = face_data[:, 4:8].astype(np.uint8)
    elif ncols >= 7:
        rgb = face_data[:, 4:7].astype(np.uint8)
        face_colors = np.column_stack([rgb, np.full(num_faces, 255, dtype=np.uint8)])
    else:
        # No color data — use neutral gray
        face_colors = np.full((num_faces, 4), 200, dtype=np.uint8)
        face_colors[:, 3] = 255

    elapsed = time.time() - t0
    print(f"  Parsed in {elapsed:.1f}s")

    return vertices, faces, face_colors


def convert(input_path: str, output_path: str, draco: bool = False) -> None:
    """Convert .off to .glb with optional Draco compression."""
    vertices, faces, face_colors = parse_coff(input_path)

    # Convert per-face colors to per-vertex colors.
    # Triangle Splatting outputs unique vertices per triangle (N = M*3),
    # so each vertex belongs to exactly one face.
    print("Assigning per-vertex colors from face colors...")
    vertex_colors = np.zeros((len(vertices), 4), dtype=np.uint8)
    vertex_colors[faces[:, 0]] = face_colors
    vertex_colors[faces[:, 1]] = face_colors
    vertex_colors[faces[:, 2]] = face_colors

    print("Building mesh...")
    mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=vertex_colors,
        process=False,  # Don't merge vertices — preserves per-face coloring
    )

    bounds = mesh.bounds
    extent = bounds[1] - bounds[0]
    print(f"  Bounds min: [{bounds[0][0]:.1f}, {bounds[0][1]:.1f}, {bounds[0][2]:.1f}]")
    print(f"  Bounds max: [{bounds[1][0]:.1f}, {bounds[1][1]:.1f}, {bounds[1][2]:.1f}]")
    print(f"  Extent:     [{extent[0]:.1f}, {extent[1]:.1f}, {extent[2]:.1f}]")

    # Export to GLB
    output = Path(output_path)
    if draco:
        temp_path = output.with_name(output.stem + "_uncompressed.glb")
    else:
        temp_path = output

    print(f"Exporting to {temp_path}...")
    mesh.export(str(temp_path), file_type="glb")

    size_mb = temp_path.stat().st_size / (1024 * 1024)
    print(f"  Size: {size_mb:.1f} MB")

    if draco:
        print("Applying Draco compression via gltf-transform...")
        try:
            # On Windows, npx is a .cmd script — use shell=True or find npx.cmd
            npx_cmd = shutil.which("npx") or "npx"
            result = subprocess.run(
                [
                    npx_cmd,
                    "--yes",
                    "@gltf-transform/cli",
                    "draco",
                    str(temp_path),
                    str(output),
                ],
                capture_output=True,
                text=True,
                timeout=300,
                shell=(sys.platform == "win32"),
            )
            if result.returncode == 0:
                compressed_mb = output.stat().st_size / (1024 * 1024)
                ratio = (1 - compressed_mb / size_mb) * 100
                print(f"  Compressed: {compressed_mb:.1f} MB ({ratio:.0f}% reduction)")
                temp_path.unlink()
            else:
                print(f"  Draco failed: {result.stderr.strip()}", file=sys.stderr)
                print("  Keeping uncompressed output.")
                if temp_path != output:
                    temp_path.rename(output)
        except FileNotFoundError:
            print(
                "  npx not found — install Node.js for Draco compression.",
                file=sys.stderr,
            )
            if temp_path != output:
                temp_path.rename(output)
        except subprocess.TimeoutExpired:
            print("  Draco compression timed out.", file=sys.stderr)
            if temp_path != output:
                temp_path.rename(output)

    final_mb = output.stat().st_size / (1024 * 1024)
    print(f"\nDone! {output} ({final_mb:.1f} MB)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert .off (COFF) to .glb for VR Scout"
    )
    parser.add_argument("input", help="Input .off file")
    parser.add_argument("output", help="Output .glb file")
    parser.add_argument(
        "--draco", action="store_true", help="Apply Draco mesh compression (requires Node.js)"
    )
    args = parser.parse_args()

    inp = Path(args.input)
    if not inp.exists():
        print(f"Error: {inp} not found", file=sys.stderr)
        sys.exit(1)

    if not inp.suffix.lower() == ".off":
        print(f"Warning: {inp} does not have .off extension", file=sys.stderr)

    convert(args.input, args.output, args.draco)


if __name__ == "__main__":
    main()
