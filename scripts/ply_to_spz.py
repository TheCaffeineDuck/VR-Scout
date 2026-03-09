#!/usr/bin/env python3
"""Convert INRIA 3DGS PLY files to Niantic SPZ format.

Usage:
    py -3.12 scripts/ply_to_spz.py public/scenes/garden.ply public/scenes/garden.spz
    py -3.12 scripts/ply_to_spz.py public/scenes/room.ply public/scenes/room.spz
"""

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import spz


def parse_ply_header(f) -> tuple[int, int, list[tuple[str, str]]]:
    """Parse PLY header and return (num_vertices, header_size, properties)."""
    magic = f.readline()
    if magic.strip() != b"ply":
        raise ValueError("Not a PLY file")

    fmt_line = f.readline().strip()
    if fmt_line != b"format binary_little_endian 1.0":
        raise ValueError(f"Unsupported PLY format: {fmt_line.decode()}")

    num_vertices = 0
    properties: list[tuple[str, str]] = []

    while True:
        line = f.readline().strip()
        if line == b"end_header":
            break
        parts = line.decode("ascii").split()
        if parts[0] == "element" and parts[1] == "vertex":
            num_vertices = int(parts[2])
        elif parts[0] == "property":
            dtype = parts[1]  # "float", "double", etc.
            name = parts[2]
            properties.append((dtype, name))

    header_size = f.tell()
    return num_vertices, header_size, properties


def ply_dtype_to_numpy(dtype_str: str) -> np.dtype:
    """Map PLY type strings to numpy dtypes."""
    mapping = {
        "float": np.float32,
        "double": np.float64,
        "uchar": np.uint8,
        "int": np.int32,
        "uint": np.uint32,
        "short": np.int16,
        "ushort": np.uint16,
    }
    if dtype_str not in mapping:
        raise ValueError(f"Unknown PLY dtype: {dtype_str}")
    return np.dtype(mapping[dtype_str])


def load_ply_gaussians(ply_path: str) -> dict:
    """Load a 3DGS PLY file and return parsed Gaussian attributes."""
    path = Path(ply_path)
    file_size_mb = path.stat().st_size / (1024 * 1024)
    print(f"Loading {path.name} ({file_size_mb:.1f} MB)...")

    with open(path, "rb") as f:
        num_vertices, header_size, properties = parse_ply_header(f)
        print(f"  Vertices: {num_vertices:,}")
        print(f"  Properties: {len(properties)}")

        # Build numpy structured dtype from PLY properties
        np_dtype = np.dtype(
            [(name, ply_dtype_to_numpy(dt)) for dt, name in properties]
        )
        bytes_per_vertex = np_dtype.itemsize
        print(f"  Bytes per vertex: {bytes_per_vertex}")

        # Read all vertex data at once
        data = np.frombuffer(f.read(num_vertices * bytes_per_vertex), dtype=np_dtype)
        assert len(data) == num_vertices, f"Expected {num_vertices}, got {len(data)}"

    # Extract positions (N, 3)
    positions = np.column_stack([data["x"], data["y"], data["z"]]).astype(np.float32)

    # Extract SH degree 0 / DC color (N, 3)
    colors = np.column_stack(
        [data["f_dc_0"], data["f_dc_1"], data["f_dc_2"]]
    ).astype(np.float32)

    # Extract opacity (N,) — already in inverse-sigmoid (logit) space
    alphas = data["opacity"].astype(np.float32)

    # Extract log-scales (N, 3)
    scales = np.column_stack(
        [data["scale_0"], data["scale_1"], data["scale_2"]]
    ).astype(np.float32)

    # Extract quaternion rotations (N, 4) — INRIA stores as (w, x, y, z)
    rotations = np.column_stack(
        [data["rot_0"], data["rot_1"], data["rot_2"], data["rot_3"]]
    ).astype(np.float32)

    # Detect SH degree from number of f_rest properties
    rest_names = [name for _, name in properties if name.startswith("f_rest_")]
    num_rest = len(rest_names)

    # f_rest count -> SH degree: 0->0, 9->1, 24->2, 45->3
    if num_rest == 0:
        sh_degree = 0
        sh_coeffs = None
    elif num_rest == 9:
        sh_degree = 1
    elif num_rest == 24:
        sh_degree = 2
    elif num_rest == 45:
        sh_degree = 3
    else:
        raise ValueError(f"Unexpected number of f_rest properties: {num_rest}")

    sh_coeffs = None
    if num_rest > 0:
        # INRIA stores SH rest as channel-major (N, 3, K) flattened to (N, 3*K):
        #   f_rest_0..f_rest_{K-1}   = channel 0 (R) for SH coeffs 1..K
        #   f_rest_K..f_rest_{2K-1}  = channel 1 (G) for SH coeffs 1..K
        #   f_rest_{2K}..f_rest_{3K-1} = channel 2 (B) for SH coeffs 1..K
        #
        # spz expects coefficient-major (N, K, 3) flattened to (N, 3*K):
        #   [c0_r, c0_g, c0_b, c1_r, c1_g, c1_b, ...]
        #
        # So we reshape (N, 3, K) -> transpose -> (N, K, 3) -> flatten (N, 3*K)
        rest_cols = np.column_stack(
            [data[f"f_rest_{i}"] for i in range(num_rest)]
        ).astype(np.float32)  # (N, 3*K)

        K = num_rest // 3  # SH coefficients per channel (15 for degree 3)
        rest_channel_major = rest_cols.reshape(num_vertices, 3, K)  # (N, 3, K)
        rest_coeff_major = rest_channel_major.transpose(0, 2, 1)  # (N, K, 3)
        sh_coeffs = np.ascontiguousarray(
            rest_coeff_major.reshape(num_vertices, num_rest)
        )  # (N, 3*K) flat, coefficient-major
        print(f"  SH degree: {sh_degree} (sh_dim={K}, flat shape={sh_coeffs.shape})")

    print(
        f"  Positions range: [{positions.min():.2f}, {positions.max():.2f}]"
    )
    print(f"  Scales range: [{scales.min():.2f}, {scales.max():.2f}]")
    print(f"  Alpha range: [{alphas.min():.2f}, {alphas.max():.2f}]")

    return {
        "positions": positions,
        "colors": colors,
        "alphas": alphas,
        "scales": scales,
        "rotations": rotations,
        "sh_degree": sh_degree,
        "spherical_harmonics": sh_coeffs,
    }


def convert_ply_to_spz(ply_path: str, spz_path: str) -> None:
    """Convert a 3DGS PLY file to SPZ format.

    Saves raw PLY data without any coordinate transformation.
    The OpenCV→OpenGL re-orientation (180° X rotation) is handled at
    render time via splatMesh.quaternion.set(1, 0, 0, 0) in scene-loader.ts,
    per Spark's documented loading approach.
    """
    t0 = time.perf_counter()

    attrs = load_ply_gaussians(ply_path)
    t_load = time.perf_counter()
    print(f"  PLY parse time: {t_load - t0:.2f}s")

    print("  Constructing GaussianSplat...")
    kwargs = {
        "positions": attrs["positions"],
        "scales": attrs["scales"],
        "rotations": attrs["rotations"],
        "alphas": attrs["alphas"],
        "colors": attrs["colors"],
        "sh_degree": attrs["sh_degree"],
    }
    if attrs["spherical_harmonics"] is not None:
        kwargs["spherical_harmonics"] = attrs["spherical_harmonics"]

    splat = spz.GaussianSplat(**kwargs)
    t_construct = time.perf_counter()
    print(f"  GaussianSplat constructed: {splat.num_points:,} points ({t_construct - t_load:.2f}s)")

    print(f"  Saving to {spz_path}...")
    splat.save(spz_path)
    t_save = time.perf_counter()

    out_size_mb = Path(spz_path).stat().st_size / (1024 * 1024)
    in_size_mb = Path(ply_path).stat().st_size / (1024 * 1024)
    ratio = out_size_mb / in_size_mb * 100

    print(f"  Save time: {t_save - t_construct:.2f}s")
    print(f"  Output: {out_size_mb:.1f} MB ({ratio:.1f}% of original {in_size_mb:.1f} MB)")
    print(f"  Total time: {t_save - t0:.2f}s")


def main():
    parser = argparse.ArgumentParser(
        description="Convert INRIA 3DGS PLY files to Niantic SPZ format."
    )
    parser.add_argument("input", help="Input .ply file path")
    parser.add_argument("output", help="Output .spz file path")
    args = parser.parse_args()

    if not Path(args.input).exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    convert_ply_to_spz(args.input, args.output)
    print("Done!")


if __name__ == "__main__":
    main()
