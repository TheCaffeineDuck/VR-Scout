#!/usr/bin/env python3
"""Mesh extraction from Gaussian PLY with floor plane detection.

Standalone script called by step_11_mesh_extraction via subprocess.
Uses Open3D for point cloud processing, Poisson reconstruction, and RANSAC.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract mesh and detect floor plane")
    parser.add_argument("--input_ply", type=Path, required=True)
    parser.add_argument("--output_dir", type=Path, required=True)
    parser.add_argument("--simplify_to", type=int, default=10000)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    try:
        import numpy as np
    except ImportError:
        print("ERROR: numpy is required", file=sys.stderr)
        return 1

    has_open3d = False
    try:
        import open3d as o3d
        has_open3d = True
    except ImportError:
        print("WARNING: open3d not available. Floor plane detection only.", file=sys.stderr)

    # Load PLY — extract just the positions
    print(f"Loading PLY: {args.input_ply}")
    positions = _load_ply_positions(args.input_ply)
    if positions is None or len(positions) == 0:
        print("ERROR: Failed to load point cloud positions", file=sys.stderr)
        return 1

    print(f"Loaded {len(positions):,} points")

    # Floor plane detection via RANSAC
    floor_y, floor_normal, confidence = _detect_floor_plane(positions)
    floor_plane_path = args.output_dir / "floor_plane.json"

    if floor_y is not None:
        floor_data = {
            "y": float(floor_y),
            "normal": [float(floor_normal[0]), float(floor_normal[1]), float(floor_normal[2])],
            "confidence": float(confidence),
            "source": "ransac",
        }
        floor_plane_path.write_text(json.dumps(floor_data, indent=2), encoding="utf-8")
        print(f"Floor plane detected at Y={floor_y:.3f}, confidence={confidence:.2f}")
    else:
        print("WARNING: No dominant horizontal plane found")

    # Mesh extraction
    mesh_path = args.output_dir / "collision_mesh.glb"

    if has_open3d:
        print("Extracting collision mesh with Open3D...")
        success = _extract_mesh_open3d(positions, mesh_path, args.simplify_to)
        if success:
            size_kb = mesh_path.stat().st_size / 1024
            print(f"Collision mesh saved: {size_kb:.0f}KB")
        else:
            print("WARNING: Mesh extraction failed", file=sys.stderr)
    else:
        print("Skipping mesh extraction (open3d not available)")

    return 0


def _load_ply_positions(path: Path) -> "np.ndarray[..., np.dtype[np.float32]] | None":
    """Load just the XYZ positions from a PLY file."""
    import struct
    import numpy as np

    with open(path, "rb") as f:
        # Read header
        vertex_count = 0
        header_size = 0
        properties: list[str] = []

        while True:
            line_bytes = f.readline()
            header_size += len(line_bytes)
            line = line_bytes.decode("ascii", errors="replace").strip()

            if line.startswith("element vertex"):
                vertex_count = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                if len(parts) >= 3:
                    properties.append(parts[1])
            elif line == "end_header":
                break

        if vertex_count == 0:
            return None

        # Calculate bytes per vertex
        type_sizes = {"float": 4, "double": 8, "uchar": 1, "int": 4, "uint": 4, "short": 2, "ushort": 2}
        bytes_per_vertex = sum(type_sizes.get(p, 4) for p in properties)

        positions = np.zeros((vertex_count, 3), dtype=np.float32)
        for i in range(vertex_count):
            data = f.read(bytes_per_vertex)
            if len(data) < 12:
                break
            x, y, z = struct.unpack_from("<fff", data, 0)
            positions[i] = [x, y, z]

    return positions


def _detect_floor_plane(
    positions: "np.ndarray[..., np.dtype[np.float32]]",
) -> tuple[float | None, "np.ndarray[..., np.dtype[np.float64]]", float]:
    """RANSAC-based floor plane detection."""
    import numpy as np

    n_points = len(positions)
    if n_points < 100:
        return None, np.array([0.0, 1.0, 0.0]), 0.0

    best_inliers = 0
    best_normal = np.array([0.0, 1.0, 0.0])
    best_d = 0.0
    threshold = 0.05  # 5cm tolerance
    rng = np.random.default_rng(42)

    # Subsample for efficiency
    if n_points > 50000:
        indices = rng.choice(n_points, 50000, replace=False)
        pts = positions[indices]
    else:
        pts = positions

    n_iterations = 500
    for _ in range(n_iterations):
        # Pick 3 random points
        idx = rng.choice(len(pts), 3, replace=False)
        p0, p1, p2 = pts[idx[0]], pts[idx[1]], pts[idx[2]]

        # Compute plane normal
        v1 = p1 - p0
        v2 = p2 - p0
        normal = np.cross(v1, v2).astype(np.float64)
        norm = float(np.linalg.norm(normal))
        if norm < 1e-8:
            continue
        normal /= norm

        # Check if roughly horizontal (normal close to [0, ±1, 0])
        up_alignment = abs(float(normal[1]))
        if up_alignment < 0.7:
            continue

        # Ensure normal points up
        if normal[1] < 0:
            normal = -normal

        d = -float(np.dot(normal, p0))
        distances = np.abs(np.dot(pts, normal) + d)
        inlier_count = int(np.sum(distances < threshold))

        if inlier_count > best_inliers:
            best_inliers = inlier_count
            best_normal = normal
            best_d = d

    confidence = best_inliers / len(pts) if len(pts) > 0 else 0.0
    floor_y = float(-best_d / best_normal[1]) if abs(best_normal[1]) > 1e-8 else None

    return floor_y, best_normal, confidence


def _extract_mesh_open3d(
    positions: "np.ndarray[..., np.dtype[np.float32]]",
    output_path: Path,
    target_triangles: int,
) -> bool:
    """Extract simplified mesh using Open3D Poisson reconstruction."""
    try:
        import open3d as o3d
        import numpy as np

        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(positions.astype(np.float64))

        # Estimate normals
        pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30))
        pcd.orient_normals_consistent_tangent_plane(k=15)

        # Poisson reconstruction
        mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
            pcd, depth=8, width=0, scale=1.1, linear_fit=False,
        )

        # Remove low-density vertices (artifacts)
        density_arr = np.asarray(densities)
        density_threshold = np.quantile(density_arr, 0.05)
        vertices_to_remove = density_arr < density_threshold
        mesh.remove_vertices_by_mask(vertices_to_remove)

        # Simplify to target triangle count
        current_triangles = len(mesh.triangles)
        if current_triangles > target_triangles:
            mesh = mesh.simplify_quadric_decimation(target_number_of_triangles=target_triangles)

        # Export as GLB
        o3d.io.write_triangle_mesh(str(output_path), mesh)
        return output_path.exists()

    except Exception as exc:
        print(f"WARNING: Mesh extraction failed: {exc}", file=sys.stderr)
        return False


if __name__ == "__main__":
    sys.exit(main())
