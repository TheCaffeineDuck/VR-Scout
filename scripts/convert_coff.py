#!/usr/bin/env python3
"""Convert COFF (Colored OFF) files to GLB with vertex colors.

Triangle Splatting exports COFF files where:
- Vertex lines: x y z (positions only)
- Face lines: 3 idx0 idx1 idx2 r g b a (per-face RGBA colors)
- Vertex:face ratio is 3:1 (each triangle owns unique vertices)

Trimesh's built-in OFF loader misses the face colors (reports visual.kind: None),
so this script parses COFF manually, converts face colors to vertex colors,
and exports to GLB.

Usage:
    python convert_coff.py public/scenes/garden.off public/scenes/garden_new.glb
    python convert_coff.py public/scenes/room.off public/scenes/room_new.glb --lods
"""

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import trimesh


LOD_LEVELS = [
    ("preview", 75_000),
    ("medium", 200_000),
    ("high", 500_000),
]


def parse_coff(filepath: str) -> trimesh.Trimesh:
    """Parse a COFF file, extracting vertices, faces, and per-face colors.

    Returns a Trimesh with vertex colors derived from face colors.
    Since Triangle Splatting produces 3 unique vertices per face,
    face colors map directly to vertex colors.
    """
    print(f"Loading {filepath}...")
    t0 = time.time()

    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"{filepath} not found")

    with open(path, "r") as f:
        # Line 1: header (COFF or OFF)
        header = f.readline().strip()
        if header not in ("COFF", "OFF"):
            raise ValueError(f"Expected COFF or OFF header, got: {header}")
        is_coff = header == "COFF"

        # Line 2: num_vertices num_faces num_edges
        counts = f.readline().strip().split()
        n_verts = int(counts[0])
        n_faces = int(counts[1])
        print(f"  Header: {header}, {n_verts:,} vertices, {n_faces:,} faces")

        # Read vertex lines: x y z [r g b [a]]
        vertices = np.empty((n_verts, 3), dtype=np.float64)
        vert_colors_from_lines = None

        # Read all vertex lines at once for speed
        print("  Reading vertices...")
        for i in range(n_verts):
            parts = f.readline().split()
            vertices[i, 0] = float(parts[0])
            vertices[i, 1] = float(parts[1])
            vertices[i, 2] = float(parts[2])
            # Some COFF variants put colors on vertex lines too
            if i == 0 and len(parts) >= 6:
                vert_colors_from_lines = np.empty((n_verts, 4), dtype=np.uint8)
                vert_colors_from_lines[0] = [
                    int(parts[3]), int(parts[4]), int(parts[5]),
                    int(parts[6]) if len(parts) >= 7 else 255,
                ]
            elif vert_colors_from_lines is not None:
                vert_colors_from_lines[i] = [
                    int(parts[3]), int(parts[4]), int(parts[5]),
                    int(parts[6]) if len(parts) >= 7 else 255,
                ]

        # Read face lines: N idx0 idx1 ... [r g b [a]]
        print("  Reading faces...")
        faces = np.empty((n_faces, 3), dtype=np.int64)
        face_colors = None

        for i in range(n_faces):
            parts = f.readline().split()
            n_face_verts = int(parts[0])
            if n_face_verts != 3:
                raise ValueError(f"Face {i} has {n_face_verts} vertices (expected 3)")
            faces[i, 0] = int(parts[1])
            faces[i, 1] = int(parts[2])
            faces[i, 2] = int(parts[3])
            # Check for face colors (RGBA after indices)
            if i == 0 and len(parts) >= 7:
                face_colors = np.empty((n_faces, 4), dtype=np.uint8)
                face_colors[0] = [
                    int(parts[4]), int(parts[5]), int(parts[6]),
                    int(parts[7]) if len(parts) >= 8 else 255,
                ]
            elif face_colors is not None and len(parts) >= 7:
                face_colors[i] = [
                    int(parts[4]), int(parts[5]), int(parts[6]),
                    int(parts[7]) if len(parts) >= 8 else 255,
                ]

    elapsed = time.time() - t0
    print(f"  Parsed in {elapsed:.1f}s")

    # Convert face colors to vertex colors
    vertex_colors = None
    if vert_colors_from_lines is not None:
        print("  Using per-vertex colors from vertex lines")
        vertex_colors = vert_colors_from_lines
    elif face_colors is not None:
        print("  Converting per-face colors to per-vertex colors...")
        # Triangle Splatting: 3 unique verts per face, so direct assignment works
        if n_verts == n_faces * 3:
            print("    Exact 3:1 vertex:face ratio - direct face-to-vertex color mapping")
            vertex_colors = np.empty((n_verts, 4), dtype=np.uint8)
            for fi in range(n_faces):
                vertex_colors[faces[fi, 0]] = face_colors[fi]
                vertex_colors[faces[fi, 1]] = face_colors[fi]
                vertex_colors[faces[fi, 2]] = face_colors[fi]
        else:
            # Shared vertices: average colors from all adjacent faces
            print(f"    Shared vertices detected (ratio {n_verts/n_faces:.2f}:1) — averaging face colors")
            color_accum = np.zeros((n_verts, 4), dtype=np.float64)
            color_count = np.zeros(n_verts, dtype=np.int32)
            for fi in range(n_faces):
                for vi in range(3):
                    idx = faces[fi, vi]
                    color_accum[idx] += face_colors[fi].astype(np.float64)
                    color_count[idx] += 1
            mask = color_count > 0
            color_accum[mask] /= color_count[mask, np.newaxis]
            vertex_colors = color_accum.astype(np.uint8)
    else:
        print("  WARNING: No colors found in COFF file", file=sys.stderr)

    # Build trimesh
    mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=vertex_colors,
        process=False,
    )

    # Stats
    bounds = mesh.bounds
    extent = bounds[1] - bounds[0]
    print(f"  Bounds: [{bounds[0][0]:.1f}, {bounds[0][1]:.1f}, {bounds[0][2]:.1f}] to "
          f"[{bounds[1][0]:.1f}, {bounds[1][1]:.1f}, {bounds[1][2]:.1f}]")
    print(f"  Extent: [{extent[0]:.1f}, {extent[1]:.1f}, {extent[2]:.1f}]")
    print(f"  Visual kind: {mesh.visual.kind if mesh.visual else 'None'}")

    return mesh


def apply_meshopt(input_path: Path, output_path: Path) -> bool:
    """Apply meshopt compression via gltfpack. Returns True on success."""
    gltfpack_cmd = shutil.which("gltfpack")
    if gltfpack_cmd is None:
        return False
    try:
        result = subprocess.run(
            [gltfpack_cmd, "-i", str(input_path), "-o", str(output_path), "-cc", "-noq"],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode == 0:
            return True
        print(f"  gltfpack failed: {result.stderr.strip()}", file=sys.stderr)
    except subprocess.TimeoutExpired:
        print("  gltfpack timed out.", file=sys.stderr)
    return False


def export_glb(mesh: trimesh.Trimesh, output_path: Path, meshopt: bool = False) -> None:
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
        print("  Applying meshopt compression...")
        if apply_meshopt(temp_path, output_path):
            compressed_mb = output_path.stat().st_size / (1024 * 1024)
            ratio = (1 - compressed_mb / raw_mb) * 100 if raw_mb > 0 else 0
            print(f"  Compressed: {compressed_mb:.1f} MB ({ratio:.0f}% reduction)")
            temp_path.unlink()
        else:
            print("  WARNING: gltfpack not found — output uncompressed.", file=sys.stderr)
            if temp_path != output_path:
                temp_path.rename(output_path)

    final_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"  Final: {output_path.name} ({final_mb:.1f} MB)")


def decimate_mesh(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    """Decimate mesh to target face count using fast_simplification with vertex color transfer."""
    if len(mesh.faces) <= target_faces:
        print(f"    Already at {len(mesh.faces):,} faces (<= {target_faces:,}), skipping")
        return mesh

    print(f"    Decimating {len(mesh.faces):,} -> {target_faces:,} faces...")
    t0 = time.time()

    import fast_simplification
    from scipy.spatial import cKDTree

    target_reduction = 1.0 - (target_faces / len(mesh.faces))

    verts_out, faces_out = fast_simplification.simplify(
        points=np.asarray(mesh.vertices, dtype=np.float64),
        triangles=np.asarray(mesh.faces, dtype=np.int32),
        target_reduction=target_reduction,
    )

    # Transfer vertex colors by nearest-vertex lookup
    new_colors = None
    if mesh.visual and hasattr(mesh.visual, "vertex_colors") and mesh.visual.vertex_colors is not None:
        tree = cKDTree(mesh.vertices)
        _, indices = tree.query(verts_out)
        new_colors = np.asarray(mesh.visual.vertex_colors)[indices]

    decimated = trimesh.Trimesh(
        vertices=verts_out, faces=faces_out,
        vertex_colors=new_colors, process=False,
    )

    elapsed = time.time() - t0
    print(f"    Result: {len(decimated.faces):,} faces in {elapsed:.1f}s")

    # Verify colors survived decimation
    has_colors = (
        decimated.visual is not None
        and hasattr(decimated.visual, "vertex_colors")
        and decimated.visual.vertex_colors is not None
        and len(decimated.visual.vertex_colors) == len(decimated.vertices)
    )
    if not has_colors:
        print("    WARNING: Vertex colors lost during decimation!", file=sys.stderr)

    return decimated


def verify_glb(glb_path: Path) -> bool:
    """Load a GLB back with trimesh and verify vertex colors are present."""
    print(f"\n  Verifying {glb_path.name}...")
    loaded = trimesh.load(str(glb_path), process=False)

    if isinstance(loaded, trimesh.Scene):
        meshes = list(loaded.geometry.values())
        if not meshes:
            print("    FAIL: No geometry in GLB", file=sys.stderr)
            return False
        m = meshes[0]
    elif isinstance(loaded, trimesh.Trimesh):
        m = loaded
    else:
        print(f"    FAIL: Unexpected type {type(loaded)}", file=sys.stderr)
        return False

    kind = m.visual.kind if m.visual else "None"
    print(f"    Vertices: {len(m.vertices):,}")
    print(f"    Faces:    {len(m.faces):,}")
    print(f"    Visual kind: {kind}")

    if kind == "vertex":
        colors = m.visual.vertex_colors
        print(f"    Color range: R[{colors[:,0].min()}-{colors[:,0].max()}] "
              f"G[{colors[:,1].min()}-{colors[:,1].max()}] "
              f"B[{colors[:,2].min()}-{colors[:,2].max()}]")
        print("    PASS: vertex colors confirmed")
        return True
    else:
        print(f"    FAIL: visual.kind is '{kind}', expected 'vertex'", file=sys.stderr)
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert COFF (Colored OFF) files to GLB with vertex colors"
    )
    parser.add_argument("input", help="Input .off (COFF) file")
    parser.add_argument("output", help="Output .glb file")
    parser.add_argument(
        "--meshopt", action="store_true",
        help="Apply meshopt compression via gltfpack",
    )
    parser.add_argument(
        "--lods", action="store_true",
        help="Generate LOD variants (preview/medium/high)",
    )
    parser.add_argument(
        "--location-id", default="scene",
        help="Location ID for LOD filenames (default: scene)",
    )
    parser.add_argument(
        "--version", default="v1",
        help="Version string for LOD filenames (default: v1)",
    )
    parser.add_argument(
        "--no-verify", action="store_true",
        help="Skip GLB verification after export",
    )

    args = parser.parse_args()

    inp = Path(args.input)
    if not inp.exists():
        print(f"Error: {inp} not found", file=sys.stderr)
        sys.exit(1)

    # Parse COFF
    mesh = parse_coff(args.input)

    # Export main GLB
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"\n--- Main export ---")
    export_glb(mesh, out_path, meshopt=args.meshopt)

    # Verify
    if not args.no_verify:
        verify_glb(out_path)

    # LODs
    if args.lods:
        out_dir = out_path.parent
        loc_id = args.location_id
        ver = args.version

        for suffix, target_faces in LOD_LEVELS:
            print(f"\n--- {suffix.upper()} LOD ({target_faces:,} faces max) ---")
            lod_mesh = decimate_mesh(mesh, target_faces)
            lod_name = f"{loc_id}_mesh_{suffix}_{ver}.glb"
            lod_path = out_dir / lod_name
            export_glb(lod_mesh, lod_path, meshopt=args.meshopt)
            if not args.no_verify:
                verify_glb(lod_path)

    print(f"\nDone!")


if __name__ == "__main__":
    main()
