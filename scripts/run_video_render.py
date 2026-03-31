#!/usr/bin/env python3
"""Camera-path flythrough video rendering from Gaussian PLY.

Standalone script called by step_13_video_render via subprocess.
Prints VIDEO_PROGRESS:frame/total for progress tracking.

Phase 2: Renders point cloud from COLMAP camera viewpoints using Open3D.
TODO: Integrate gsplat rasterization for full Gaussian splat rendering.
"""
from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Render flythrough from Gaussian PLY")
    parser.add_argument("--input_ply", type=Path, required=True)
    parser.add_argument("--cameras_dir", type=Path, required=True)
    parser.add_argument("--output_dir", type=Path, required=True)
    parser.add_argument("--resolution", default="1920x1080")
    parser.add_argument("--max_frames", type=int, default=300)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    try:
        import numpy as np
    except ImportError:
        print("ERROR: numpy is required", file=sys.stderr)
        return 1

    width, height = (int(x) for x in args.resolution.split("x"))

    # Load point cloud positions and colors
    print(f"Loading PLY: {args.input_ply}")
    positions, colors = _load_ply_with_colors(args.input_ply)
    if positions is None or len(positions) == 0:
        print("ERROR: Failed to load point cloud", file=sys.stderr)
        return 1
    print(f"Loaded {len(positions):,} points")

    # Load camera poses from COLMAP binary
    cameras = _load_colmap_cameras(args.cameras_dir)
    if not cameras:
        print("ERROR: No camera poses found in aligned directory", file=sys.stderr)
        return 1
    print(f"Loaded {len(cameras)} camera poses")

    # Limit number of frames
    if len(cameras) > args.max_frames:
        step = len(cameras) / args.max_frames
        indices = [int(i * step) for i in range(args.max_frames)]
        cameras = [cameras[i] for i in indices]

    total = len(cameras)

    # Try Open3D offscreen rendering
    has_open3d = False
    try:
        import open3d as o3d
        has_open3d = True
    except ImportError:
        print("WARNING: open3d not available, using simple projection", file=sys.stderr)

    if has_open3d:
        success = _render_with_open3d(positions, colors, cameras, args.output_dir, width, height, total)
        if success:
            return 0

    # Fallback: simple orthographic point projection
    _render_simple(positions, colors, cameras, args.output_dir, width, height, total)
    return 0


def _load_ply_with_colors(
    path: Path,
) -> tuple["np.ndarray | None", "np.ndarray | None"]:
    """Load positions and colors from PLY."""
    import numpy as np

    with open(path, "rb") as f:
        vertex_count = 0
        properties: list[tuple[str, str]] = []
        header_size = 0

        while True:
            line_bytes = f.readline()
            header_size += len(line_bytes)
            line = line_bytes.decode("ascii", errors="replace").strip()
            if line.startswith("element vertex"):
                vertex_count = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                if len(parts) >= 3:
                    properties.append((parts[1], parts[2]))
            elif line == "end_header":
                break

        if vertex_count == 0:
            return None, None

        type_sizes = {"float": 4, "double": 8, "uchar": 1, "int": 4, "uint": 4, "short": 2, "ushort": 2}
        bytes_per_vertex = sum(type_sizes.get(p[0], 4) for p in properties)

        # Find color offsets
        color_names = {"red", "green", "blue", "f_dc_0", "f_dc_1", "f_dc_2"}
        color_offsets: dict[str, tuple[int, str]] = {}
        offset = 0
        for ptype, pname in properties:
            if pname in color_names:
                color_offsets[pname] = (offset, ptype)
            offset += type_sizes.get(ptype, 4)

        positions = np.zeros((vertex_count, 3), dtype=np.float32)
        colors = np.full((vertex_count, 3), 128, dtype=np.uint8)

        raw = f.read()

    for i in range(min(vertex_count, len(raw) // bytes_per_vertex)):
        off = i * bytes_per_vertex
        x, y, z = struct.unpack_from("<fff", raw, off)
        positions[i] = [x, y, z]

        # Try to extract colors
        if "red" in color_offsets:
            r_off, r_type = color_offsets["red"]
            g_off, _ = color_offsets.get("green", (r_off + 1, "uchar"))
            b_off, _ = color_offsets.get("blue", (r_off + 2, "uchar"))
            if r_type == "uchar":
                colors[i] = [raw[off + r_off], raw[off + g_off], raw[off + b_off]]
            elif r_type == "float":
                r = struct.unpack_from("<f", raw, off + r_off)[0]
                g = struct.unpack_from("<f", raw, off + g_off)[0]
                b = struct.unpack_from("<f", raw, off + b_off)[0]
                colors[i] = [
                    max(0, min(255, int(r * 255))),
                    max(0, min(255, int(g * 255))),
                    max(0, min(255, int(b * 255))),
                ]
        elif "f_dc_0" in color_offsets:
            # gsplat SH DC coefficients → RGB
            dc0_off, _ = color_offsets["f_dc_0"]
            dc1_off, _ = color_offsets.get("f_dc_1", (dc0_off + 4, "float"))
            dc2_off, _ = color_offsets.get("f_dc_2", (dc0_off + 8, "float"))
            sh0 = struct.unpack_from("<f", raw, off + dc0_off)[0]
            sh1 = struct.unpack_from("<f", raw, off + dc1_off)[0]
            sh2 = struct.unpack_from("<f", raw, off + dc2_off)[0]
            # SH DC to RGB: C0 = 0.28209479177387814
            c0 = 0.28209479177387814
            colors[i] = [
                max(0, min(255, int((sh0 * c0 + 0.5) * 255))),
                max(0, min(255, int((sh1 * c0 + 0.5) * 255))),
                max(0, min(255, int((sh2 * c0 + 0.5) * 255))),
            ]

    return positions, colors


def _load_colmap_cameras(
    cameras_dir: Path,
) -> list[tuple["np.ndarray", "np.ndarray"]]:
    """Load camera extrinsics from COLMAP binary images.bin.

    Returns list of (rotation_matrix, translation) tuples.
    """
    import numpy as np

    images_bin = cameras_dir / "images.bin"
    if not images_bin.exists():
        return []

    cameras: list[tuple[np.ndarray, np.ndarray]] = []

    with open(images_bin, "rb") as f:
        num_images = struct.unpack("<Q", f.read(8))[0]

        for _ in range(num_images):
            _image_id = struct.unpack("<I", f.read(4))[0]
            qw, qx, qy, qz = struct.unpack("<dddd", f.read(32))
            tx, ty, tz = struct.unpack("<ddd", f.read(24))
            _camera_id = struct.unpack("<I", f.read(4))[0]

            # Read image name (null-terminated)
            name_chars: list[bytes] = []
            while True:
                c = f.read(1)
                if c == b"\x00" or not c:
                    break
                name_chars.append(c)

            # Read 2D points
            num_points = struct.unpack("<Q", f.read(8))[0]
            f.read(num_points * 24)  # Skip point2D data

            # Quaternion to rotation matrix
            r = _quat_to_rotation_matrix(qw, qx, qy, qz)
            t = np.array([tx, ty, tz])

            # COLMAP stores world-to-camera; compute camera position
            cameras.append((r, t))

    return cameras


def _quat_to_rotation_matrix(
    qw: float, qx: float, qy: float, qz: float,
) -> "np.ndarray":
    """Convert quaternion to 3x3 rotation matrix."""
    import numpy as np

    r = np.array([
        [1 - 2*(qy*qy + qz*qz), 2*(qx*qy - qz*qw), 2*(qx*qz + qy*qw)],
        [2*(qx*qy + qz*qw), 1 - 2*(qx*qx + qz*qz), 2*(qy*qz - qx*qw)],
        [2*(qx*qz - qy*qw), 2*(qy*qz + qx*qw), 1 - 2*(qx*qx + qy*qy)],
    ])
    return r


def _render_with_open3d(
    positions: "np.ndarray",
    colors: "np.ndarray",
    cameras: list[tuple["np.ndarray", "np.ndarray"]],
    output_dir: Path,
    width: int,
    height: int,
    total: int,
) -> bool:
    """Render point cloud from each camera viewpoint using Open3D."""
    try:
        import open3d as o3d
        import numpy as np

        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(positions.astype(np.float64))
        pcd.colors = o3d.utility.Vector3dVector(colors.astype(np.float64) / 255.0)

        vis = o3d.visualization.rendering.OffscreenRenderer(width, height)
        mat = o3d.visualization.rendering.MaterialRecord()
        mat.shader = "defaultUnlit"
        mat.point_size = 2.0
        vis.scene.add_geometry("pcd", pcd, mat)

        for idx, (r, t) in enumerate(cameras):
            # Camera position: C = -R^T @ t
            camera_pos = -r.T @ t
            look_dir = r[2, :]  # Camera Z axis
            up = -r[1, :]  # Camera Y axis (negated for OpenGL convention)

            look_at = camera_pos + look_dir
            vis.setup_camera(60.0, camera_pos.tolist(), look_at.tolist(), up.tolist())

            img = vis.render_to_image()
            frame_path = output_dir / f"frame_{idx:05d}.png"
            o3d.io.write_image(str(frame_path), img)

            print(f"VIDEO_PROGRESS:{idx + 1}/{total}")

        return True
    except Exception as exc:
        print(f"Open3D rendering failed: {exc}", file=sys.stderr)
        return False


def _render_simple(
    positions: "np.ndarray",
    colors: "np.ndarray",
    cameras: list[tuple["np.ndarray", "np.ndarray"]],
    output_dir: Path,
    width: int,
    height: int,
    total: int,
) -> None:
    """Simple point projection fallback without Open3D renderer."""
    import numpy as np
    from PIL import Image

    focal = width * 0.8  # Approximate focal length

    for idx, (r, t) in enumerate(cameras):
        # Project points: p_cam = R @ p_world + t
        cam_points = (r @ positions.T).T + t

        # Filter points in front of camera
        z = cam_points[:, 2]
        valid = z > 0.1
        cam_valid = cam_points[valid]
        col_valid = colors[valid]

        if len(cam_valid) == 0:
            # Create blank frame
            img = Image.new("RGB", (width, height), (30, 30, 30))
            img.save(str(output_dir / f"frame_{idx:05d}.png"))
            print(f"VIDEO_PROGRESS:{idx + 1}/{total}")
            continue

        # Perspective projection
        x_proj = (cam_valid[:, 0] / cam_valid[:, 2] * focal + width / 2).astype(np.int32)
        y_proj = (cam_valid[:, 1] / cam_valid[:, 2] * focal + height / 2).astype(np.int32)

        # Render to image
        img_array = np.full((height, width, 3), 30, dtype=np.uint8)
        in_bounds = (x_proj >= 0) & (x_proj < width) & (y_proj >= 0) & (y_proj < height)
        x_in = x_proj[in_bounds]
        y_in = y_proj[in_bounds]
        c_in = col_valid[in_bounds]
        img_array[y_in, x_in] = c_in

        img = Image.fromarray(img_array)
        img.save(str(output_dir / f"frame_{idx:05d}.png"))
        print(f"VIDEO_PROGRESS:{idx + 1}/{total}")


if __name__ == "__main__":
    sys.exit(main())
