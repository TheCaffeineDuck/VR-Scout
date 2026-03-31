#!/usr/bin/env python3
"""Gaussian pruning using SOR + opacity heuristics.

Standalone script called by step_10_pruning via subprocess.
Prints PRUNING_PROGRESS:current/target for progress tracking.

TODO: Implement LPIPS-guided perceptual pruning for higher quality.
Current implementation uses statistical outlier removal + opacity filtering.
"""
from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Prune Gaussian PLY to target count")
    parser.add_argument("--input_ply", type=Path, required=True)
    parser.add_argument("--output_ply", type=Path, required=True)
    parser.add_argument("--target_count", type=int, required=True)
    parser.add_argument("--opacity_threshold", type=float, default=0.005)
    args = parser.parse_args()

    if not args.input_ply.exists():
        print(f"ERROR: Input PLY not found: {args.input_ply}", file=sys.stderr)
        return 1

    try:
        import numpy as np
    except ImportError:
        print("ERROR: numpy required for pruning", file=sys.stderr)
        return 1

    # Try to use Open3D for SOR, fall back to numpy-only
    has_open3d = False
    try:
        import open3d as o3d
        has_open3d = True
    except ImportError:
        print("WARNING: open3d not available, using basic pruning only", file=sys.stderr)

    print(f"Loading PLY: {args.input_ply}")

    # Read PLY header to get vertex count and properties
    header_lines, header_size, vertex_count, properties = _read_ply_header(args.input_ply)
    if vertex_count == 0:
        print("ERROR: No vertices found in PLY", file=sys.stderr)
        return 1

    print(f"Input gaussians: {vertex_count:,}")
    print(f"Target: {args.target_count:,}")
    print(f"PRUNING_PROGRESS:{vertex_count}/{args.target_count}")

    if vertex_count <= args.target_count:
        print("Already within budget, copying file as-is")
        import shutil
        shutil.copy2(args.input_ply, args.output_ply)
        print(f"PRUNING_PROGRESS:{vertex_count}/{args.target_count}")
        return 0

    # Read binary vertex data
    with open(args.input_ply, "rb") as f:
        f.seek(header_size)
        raw_data = f.read()

    # Calculate bytes per vertex
    bytes_per_vertex = len(raw_data) // vertex_count
    if bytes_per_vertex * vertex_count != len(raw_data):
        print(f"WARNING: Data size mismatch. Expected {bytes_per_vertex * vertex_count}, got {len(raw_data)}",
              file=sys.stderr)

    # Extract positions (first 3 floats) and find opacity property
    positions = np.zeros((vertex_count, 3), dtype=np.float32)
    opacities = np.ones(vertex_count, dtype=np.float32)

    opacity_offset = _find_property_offset(properties, "opacity")
    for i in range(vertex_count):
        offset = i * bytes_per_vertex
        x, y, z = struct.unpack_from("<fff", raw_data, offset)
        positions[i] = [x, y, z]
        if opacity_offset >= 0:
            op_val = struct.unpack_from("<f", raw_data, offset + opacity_offset)[0]
            # gsplat stores opacity as logit; convert with sigmoid
            opacities[i] = 1.0 / (1.0 + np.exp(-op_val))

    keep_mask = np.ones(vertex_count, dtype=bool)
    current_count = vertex_count

    # Step 1: Opacity filtering
    if opacity_offset >= 0:
        opacity_mask = opacities > args.opacity_threshold
        keep_mask &= opacity_mask
        current_count = int(np.sum(keep_mask))
        print(f"After opacity filter (>{args.opacity_threshold}): {current_count:,} gaussians")
        print(f"PRUNING_PROGRESS:{current_count}/{args.target_count}")

    # Step 2: Statistical Outlier Removal
    if has_open3d and current_count > args.target_count:
        kept_positions = positions[keep_mask]
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(kept_positions.astype(np.float64))
        _, inlier_indices = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)

        sor_mask = np.zeros(current_count, dtype=bool)
        for idx in inlier_indices:
            sor_mask[idx] = True

        # Map back to original indices
        kept_indices = np.where(keep_mask)[0]
        for i, orig_idx in enumerate(kept_indices):
            if not sor_mask[i]:
                keep_mask[orig_idx] = False

        current_count = int(np.sum(keep_mask))
        print(f"After SOR: {current_count:,} gaussians")
        print(f"PRUNING_PROGRESS:{current_count}/{args.target_count}")

    # Step 3: Random subsample if still over budget
    if current_count > args.target_count:
        kept_indices = np.where(keep_mask)[0]
        # Prefer keeping higher-opacity gaussians
        kept_opacities = opacities[kept_indices]
        # Sort by opacity descending, keep top target_count
        sorted_by_opacity = np.argsort(-kept_opacities)
        to_remove = sorted_by_opacity[args.target_count:]
        for idx in to_remove:
            keep_mask[kept_indices[idx]] = False

        current_count = int(np.sum(keep_mask))
        print(f"After budget trim: {current_count:,} gaussians")
        print(f"PRUNING_PROGRESS:{current_count}/{args.target_count}")

    # Write output PLY with kept vertices
    kept_indices = np.where(keep_mask)[0]
    _write_pruned_ply(
        args.output_ply, header_lines, len(kept_indices),
        raw_data, bytes_per_vertex, kept_indices,
    )

    print(f"Pruning complete: {vertex_count:,} → {len(kept_indices):,} gaussians")
    print(f"PRUNING_PROGRESS:{len(kept_indices)}/{args.target_count}")
    return 0


def _read_ply_header(
    path: Path,
) -> tuple[list[str], int, int, list[tuple[str, str]]]:
    """Read PLY header, return (header_lines, header_byte_size, vertex_count, properties)."""
    header_lines: list[str] = []
    vertex_count = 0
    properties: list[tuple[str, str]] = []
    header_size = 0

    with open(path, "rb") as f:
        while True:
            line_bytes = f.readline()
            header_size += len(line_bytes)
            line = line_bytes.decode("ascii", errors="replace").strip()
            header_lines.append(line)

            if line.startswith("element vertex"):
                vertex_count = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                if len(parts) >= 3:
                    properties.append((parts[1], parts[2]))
            elif line == "end_header":
                break

    return header_lines, header_size, vertex_count, properties


def _find_property_offset(properties: list[tuple[str, str]], name: str) -> int:
    """Find byte offset for a named property. Returns -1 if not found."""
    type_sizes = {"float": 4, "double": 8, "uchar": 1, "int": 4, "uint": 4, "short": 2, "ushort": 2}
    offset = 0
    for ptype, pname in properties:
        if pname == name:
            return offset
        offset += type_sizes.get(ptype, 4)
    return -1


def _write_pruned_ply(
    output_path: Path,
    original_header: list[str],
    new_count: int,
    raw_data: bytes,
    bytes_per_vertex: int,
    kept_indices: "np.ndarray[..., np.dtype[np.intp]]",
) -> None:
    """Write a new PLY with only the kept vertices."""
    # Rewrite header with new vertex count
    new_header_lines: list[str] = []
    for line in original_header:
        if line.startswith("element vertex"):
            new_header_lines.append(f"element vertex {new_count}")
        else:
            new_header_lines.append(line)

    with open(output_path, "wb") as f:
        for line in new_header_lines:
            f.write((line + "\n").encode("ascii"))

        for idx in kept_indices:
            start = int(idx) * bytes_per_vertex
            end = start + bytes_per_vertex
            f.write(raw_data[start:end])


if __name__ == "__main__":
    sys.exit(main())
