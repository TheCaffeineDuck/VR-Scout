#!/usr/bin/env python3
"""Convert gsplat .pt checkpoint to standard Gaussian Splatting PLY format.

Usage:
    python ckpt_to_ply.py <checkpoint.pt> <output.ply>

The PLY format follows the standard 3DGS convention:
    - x, y, z (position)
    - nx, ny, nz (normals, set to 0)
    - f_dc_0..2 (DC spherical harmonics = base color)
    - f_rest_0..N (higher order SH coefficients)
    - opacity (logit-space)
    - scale_0..2 (log-space)
    - rot_0..3 (quaternion)
"""

import struct
import sys

import numpy as np
import torch


def main() -> None:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <checkpoint.pt> <output.ply>")
        sys.exit(1)

    ckpt_path = sys.argv[1]
    ply_path = sys.argv[2]

    print(f"Loading checkpoint: {ckpt_path}")
    data = torch.load(ckpt_path, map_location="cpu")

    splats = data["splats"]
    means = splats["means"].numpy()  # (N, 3)
    quats = splats["quats"].numpy()  # (N, 4)
    scales = splats["scales"].numpy()  # (N, 3) — log-space
    opacities = splats["opacities"].numpy()  # (N,) — logit-space
    sh0 = splats["sh0"].numpy()  # (N, 1, 3) — DC component
    shN = splats.get("shN")  # (N, K, 3) — higher order SH, may be None

    N = means.shape[0]
    print(f"Number of Gaussians: {N}")

    # Flatten SH coefficients
    # DC: (N, 1, 3) -> (N, 3) for f_dc_0, f_dc_1, f_dc_2
    sh0_flat = sh0.reshape(N, 3)

    if shN is not None:
        shN_np = shN.numpy() if isinstance(shN, torch.Tensor) else shN
        # (N, K, 3) -> (N, K*3) for f_rest_0 .. f_rest_{K*3-1}
        shN_flat = shN_np.reshape(N, -1)
        n_rest = shN_flat.shape[1]
    else:
        shN_flat = np.zeros((N, 0), dtype=np.float32)
        n_rest = 0

    # Build PLY header
    properties = [
        "property float x",
        "property float y",
        "property float z",
        "property float nx",
        "property float ny",
        "property float nz",
    ]
    for i in range(3):
        properties.append(f"property float f_dc_{i}")
    for i in range(n_rest):
        properties.append(f"property float f_rest_{i}")
    properties.append("property float opacity")
    for i in range(3):
        properties.append(f"property float scale_{i}")
    for i in range(4):
        properties.append(f"property float rot_{i}")

    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {N}\n"
        + "\n".join(properties) + "\n"
        "end_header\n"
    )

    print(f"Writing PLY: {ply_path}")
    with open(ply_path, "wb") as f:
        f.write(header.encode("ascii"))

        normals = np.zeros((N, 3), dtype=np.float32)

        for i in range(N):
            # position
            f.write(struct.pack("<fff", *means[i]))
            # normals
            f.write(struct.pack("<fff", *normals[i]))
            # DC SH
            f.write(struct.pack("<fff", *sh0_flat[i]))
            # Rest SH
            if n_rest > 0:
                f.write(struct.pack(f"<{n_rest}f", *shN_flat[i]))
            # opacity
            f.write(struct.pack("<f", opacities[i]))
            # scale (log-space)
            f.write(struct.pack("<fff", *scales[i]))
            # rotation (quaternion)
            f.write(struct.pack("<ffff", *quats[i]))

    file_size_mb = ply_path and round(
        sum(1 for _ in open(ply_path, "rb")) / 1048576, 1
    )
    print(f"Done. PLY written with {N} Gaussians.")


if __name__ == "__main__":
    main()
