#!/usr/bin/env python3
"""
align_scene.py — Detect the floor plane in a Gaussian splat PLY and compute
the rotation needed to align it with Y-up for Three.js consumption.

Uses RANSAC plane fitting on the lowest splats to find the floor, then computes
a quaternion rotation that maps the floor normal → (0, 1, 0).

Usage:
    python scripts/align_scene.py path/to/splat.ply [--plot] [--vertical-axis z|y]

Output:
    Euler angles (degrees), 3x3 rotation matrix, and quaternion (x, y, z, w)
    suitable for Three.js sceneRotation or direct quaternion application.

Dependencies:
    pip install plyfile scikit-learn matplotlib numpy
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from plyfile import PlyData
from sklearn.linear_model import RANSACRegressor


def load_positions(ply_path: str) -> np.ndarray:
    """Load XYZ positions from a Gaussian splat PLY file."""
    ply = PlyData.read(ply_path)
    v = ply["vertex"]
    x = np.array(v["x"], dtype=np.float64)
    y = np.array(v["y"], dtype=np.float64)
    z = np.array(v["z"], dtype=np.float64)
    return np.column_stack([x, y, z])


def detect_vertical_axis(points: np.ndarray) -> int:
    """Heuristic: the vertical axis typically has the smallest extent (floor-to-ceiling
    is shorter than the horizontal footprint in most indoor scenes). Returns axis index."""
    extents = points.max(axis=0) - points.min(axis=0)
    # Vertical axis is usually the smallest extent in indoor scenes
    # But can be overridden via --vertical-axis
    return int(np.argmin(extents))


def find_floor_plane(points: np.ndarray, vertical_axis: int) -> tuple[np.ndarray, float]:
    """
    Use RANSAC to fit a plane to the lowest ~15% of points along the vertical axis.

    Returns:
        normal: unit normal vector of the floor plane (pointing "up")
        offset: signed distance from origin to the plane
    """
    # Sort by the vertical axis and take the lowest 15%
    v_vals = points[:, vertical_axis]
    threshold = np.percentile(v_vals, 15)
    low_mask = v_vals <= threshold
    low_points = points[low_mask]

    print(f"  Floor candidates: {low_points.shape[0]} points (lowest 15% along axis {vertical_axis})")

    # RANSAC: fit plane z = ax + by + c (where "z" is the vertical axis)
    # Rearrange: for a general plane ax + by + cz + d = 0, we fit the vertical
    # component as a function of the other two.
    horiz_axes = [i for i in range(3) if i != vertical_axis]
    X = low_points[:, horiz_axes]  # (N, 2)
    y = low_points[:, vertical_axis]  # (N,)

    ransac = RANSACRegressor(
        estimator=None,  # LinearRegression
        min_samples=3,
        residual_threshold=0.05,  # 5cm tolerance for floor membership
        max_trials=2000,
        random_state=42,
    )
    ransac.fit(X, y)

    inlier_count = ransac.inlier_mask_.sum()
    print(f"  RANSAC inliers: {inlier_count} / {low_points.shape[0]}")

    # The fitted plane is: v = a*h0 + b*h1 + c
    # Normal in 3D: (-a, -b, 1) for the vertical axis component, then reorder
    coef = ransac.estimator_.coef_  # [a, b]
    intercept = ransac.estimator_.intercept_  # c

    normal_raw = np.zeros(3)
    normal_raw[horiz_axes[0]] = -coef[0]
    normal_raw[horiz_axes[1]] = -coef[1]
    normal_raw[vertical_axis] = 1.0
    normal = normal_raw / np.linalg.norm(normal_raw)

    # Ensure normal points "up" (toward higher vertical values = away from floor)
    if normal[vertical_axis] < 0:
        normal = -normal

    floor_height = intercept
    print(f"  Floor normal: [{normal[0]:.6f}, {normal[1]:.6f}, {normal[2]:.6f}]")
    print(f"  Floor height (along axis {vertical_axis}): {floor_height:.4f}")

    return normal, floor_height


def rotation_between_vectors(v_from: np.ndarray, v_to: np.ndarray) -> np.ndarray:
    """
    Compute the rotation matrix that rotates v_from to v_to.
    Both must be unit vectors.
    Uses Rodrigues' rotation formula.
    """
    v_from = v_from / np.linalg.norm(v_from)
    v_to = v_to / np.linalg.norm(v_to)

    cross = np.cross(v_from, v_to)
    dot = np.dot(v_from, v_to)

    # Handle parallel vectors
    if np.linalg.norm(cross) < 1e-10:
        if dot > 0:
            return np.eye(3)  # Already aligned
        else:
            # 180° rotation — find an arbitrary perpendicular axis
            perp = np.array([1, 0, 0]) if abs(v_from[0]) < 0.9 else np.array([0, 1, 0])
            axis = np.cross(v_from, perp)
            axis = axis / np.linalg.norm(axis)
            # Rotation matrix for 180° around axis
            K = np.array([
                [0, -axis[2], axis[1]],
                [axis[2], 0, -axis[0]],
                [-axis[1], axis[0], 0],
            ])
            return np.eye(3) + 2 * K @ K

    # Rodrigues' formula: R = I + [v]x + [v]x^2 * (1 / (1 + c))
    K = np.array([
        [0, -cross[2], cross[1]],
        [cross[2], 0, -cross[0]],
        [-cross[1], cross[0], 0],
    ])
    R = np.eye(3) + K + K @ K * (1.0 / (1.0 + dot))
    return R


def rotation_matrix_to_quaternion(R: np.ndarray) -> np.ndarray:
    """Convert 3x3 rotation matrix to quaternion (x, y, z, w)."""
    trace = R[0, 0] + R[1, 1] + R[2, 2]

    if trace > 0:
        s = 0.5 / np.sqrt(trace + 1.0)
        w = 0.25 / s
        x = (R[2, 1] - R[1, 2]) * s
        y = (R[0, 2] - R[2, 0]) * s
        z = (R[1, 0] - R[0, 1]) * s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = 2.0 * np.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2])
        w = (R[2, 1] - R[1, 2]) / s
        x = 0.25 * s
        y = (R[0, 1] + R[1, 0]) / s
        z = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = 2.0 * np.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2])
        w = (R[0, 2] - R[2, 0]) / s
        x = (R[0, 1] + R[1, 0]) / s
        y = 0.25 * s
        z = (R[1, 2] + R[2, 1]) / s
    else:
        s = 2.0 * np.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1])
        w = (R[1, 0] - R[0, 1]) / s
        x = (R[0, 2] + R[2, 0]) / s
        y = (R[1, 2] + R[2, 1]) / s
        z = 0.25 * s

    q = np.array([x, y, z, w])
    return q / np.linalg.norm(q)  # Normalize


def rotation_matrix_to_euler(R: np.ndarray) -> np.ndarray:
    """Convert 3x3 rotation matrix to Euler angles (XYZ order) in degrees."""
    # ZYX intrinsic = XYZ extrinsic
    sy = np.sqrt(R[0, 0] ** 2 + R[1, 0] ** 2)
    singular = sy < 1e-6

    if not singular:
        x = np.arctan2(R[2, 1], R[2, 2])
        y = np.arctan2(-R[2, 0], sy)
        z = np.arctan2(R[1, 0], R[0, 0])
    else:
        x = np.arctan2(-R[1, 2], R[1, 1])
        y = np.arctan2(-R[2, 0], sy)
        z = 0

    return np.degrees(np.array([x, y, z]))


def compute_scene_centroid_and_floor(
    points: np.ndarray, R: np.ndarray, floor_height: float, vertical_axis: int
) -> dict:
    """Compute scene centroid and floor height after rotation."""
    rotated = (R @ points.T).T

    centroid = rotated.mean(axis=0)
    # After alignment, Y is up — floor is at the minimum Y
    y_vals = rotated[:, 1]
    floor_y = np.percentile(y_vals, 2)  # 2nd percentile to exclude outliers
    spawn_y = floor_y + 1.6  # Eye height

    return {
        "centroid": centroid,
        "floor_y": floor_y,
        "spawn_position": [centroid[0], spawn_y, centroid[2]],
        "bounds_min": rotated.min(axis=0),
        "bounds_max": rotated.max(axis=0),
    }


def plot_alignment(points: np.ndarray, R: np.ndarray, output_path: str) -> None:
    """Generate before/after scatter plots showing floor alignment."""
    import matplotlib.pyplot as plt

    rotated = (R @ points.T).T

    # Subsample for plotting (max 10k points)
    n = len(points)
    if n > 10000:
        idx = np.random.default_rng(42).choice(n, 10000, replace=False)
        pts_before = points[idx]
        pts_after = rotated[idx]
    else:
        pts_before = points
        pts_after = rotated

    fig, axes = plt.subplots(2, 2, figsize=(14, 12))

    # Before: XZ top-down
    axes[0, 0].scatter(pts_before[:, 0], pts_before[:, 2], s=0.3, alpha=0.3, c="steelblue")
    axes[0, 0].set_xlabel("X")
    axes[0, 0].set_ylabel("Z")
    axes[0, 0].set_title("BEFORE — Top-down (XZ)")
    axes[0, 0].set_aspect("equal")

    # Before: XY side view
    axes[0, 1].scatter(pts_before[:, 0], pts_before[:, 1], s=0.3, alpha=0.3, c="steelblue")
    axes[0, 1].set_xlabel("X")
    axes[0, 1].set_ylabel("Y")
    axes[0, 1].set_title("BEFORE — Side view (XY)")
    axes[0, 1].set_aspect("equal")

    # After: XZ top-down
    axes[1, 0].scatter(pts_after[:, 0], pts_after[:, 2], s=0.3, alpha=0.3, c="forestgreen")
    axes[1, 0].set_xlabel("X")
    axes[1, 0].set_ylabel("Z")
    axes[1, 0].set_title("AFTER — Top-down (XZ)")
    axes[1, 0].set_aspect("equal")

    # After: XY side view (should show flat floor at bottom)
    axes[1, 1].scatter(pts_after[:, 0], pts_after[:, 1], s=0.3, alpha=0.3, c="forestgreen")
    axes[1, 1].set_xlabel("X")
    axes[1, 1].set_ylabel("Y (up)")
    axes[1, 1].set_title("AFTER — Side view (XY) — floor should be flat at bottom")
    axes[1, 1].set_aspect("equal")

    # Add floor line on the after side view
    y_vals = pts_after[:, 1]
    floor_y = np.percentile(y_vals, 2)
    axes[1, 1].axhline(y=floor_y, color="red", linestyle="--", linewidth=1, label=f"Floor ≈ {floor_y:.2f}")
    axes[1, 1].legend()

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"\n  Plot saved: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Detect floor plane in a Gaussian splat PLY and compute alignment rotation."
    )
    parser.add_argument("ply_path", help="Path to the .ply file")
    parser.add_argument("--plot", action="store_true", help="Generate before/after alignment plots")
    parser.add_argument(
        "--vertical-axis",
        choices=["x", "y", "z", "auto"],
        default="auto",
        help="Which axis is roughly vertical in the source data (default: auto-detect)",
    )
    parser.add_argument(
        "--plot-output",
        default=None,
        help="Output path for plot image (default: <ply_basename>_alignment.png)",
    )
    args = parser.parse_args()

    ply_path = Path(args.ply_path)
    if not ply_path.exists():
        print(f"Error: {ply_path} not found")
        sys.exit(1)

    print(f"Loading {ply_path}...")
    points = load_positions(str(ply_path))
    print(f"  Loaded {len(points):,} splats")

    extents = points.max(axis=0) - points.min(axis=0)
    print(f"  Extents: X={extents[0]:.2f}  Y={extents[1]:.2f}  Z={extents[2]:.2f}")
    print(f"  Center:  X={points.mean(axis=0)[0]:.2f}  Y={points.mean(axis=0)[1]:.2f}  Z={points.mean(axis=0)[2]:.2f}")

    # Determine vertical axis
    axis_map = {"x": 0, "y": 1, "z": 2}
    if args.vertical_axis == "auto":
        v_axis = detect_vertical_axis(points)
        print(f"  Auto-detected vertical axis: {'XYZ'[v_axis]} (smallest extent: {extents[v_axis]:.2f})")
    else:
        v_axis = axis_map[args.vertical_axis]
        print(f"  Using specified vertical axis: {'XYZ'[v_axis]}")

    # Find floor plane
    print("\nFinding floor plane (RANSAC)...")
    floor_normal, floor_height = find_floor_plane(points, v_axis)

    # Target: Y-up in Three.js
    target_up = np.array([0.0, 1.0, 0.0])

    # Compute rotation
    print("\nComputing alignment rotation...")
    R = rotation_between_vectors(floor_normal, target_up)

    # Verify: R @ floor_normal should ≈ target_up
    aligned_normal = R @ floor_normal
    dot_check = np.dot(aligned_normal, target_up)
    print(f"  Verification: rotated normal · target = {dot_check:.6f} (should be ~1.0)")

    # Convert to various representations
    euler_deg = rotation_matrix_to_euler(R)
    quat = rotation_matrix_to_quaternion(R)
    euler_rad = np.radians(euler_deg)

    print("\n" + "=" * 60)
    print("ALIGNMENT ROTATION")
    print("=" * 60)

    print(f"\nEuler angles (degrees, XYZ order):")
    print(f"  rx={euler_deg[0]:.4f}°  ry={euler_deg[1]:.4f}°  rz={euler_deg[2]:.4f}°")

    print(f"\nEuler angles (radians, XYZ order) — for sceneRotation:")
    print(f"  [{euler_rad[0]:.6f}, {euler_rad[1]:.6f}, {euler_rad[2]:.6f}]")

    print(f"\nQuaternion (x, y, z, w) — for Three.js:")
    print(f"  [{quat[0]:.6f}, {quat[1]:.6f}, {quat[2]:.6f}, {quat[3]:.6f}]")

    print(f"\nRotation matrix:")
    for row in R:
        print(f"  [{row[0]:+.6f}, {row[1]:+.6f}, {row[2]:+.6f}]")

    # Scene info after alignment
    print("\n" + "=" * 60)
    print("SCENE INFO (after alignment)")
    print("=" * 60)
    info = compute_scene_centroid_and_floor(points, R, floor_height, v_axis)
    print(f"  Floor Y:  {info['floor_y']:.4f}")
    print(f"  Centroid: [{info['centroid'][0]:.2f}, {info['centroid'][1]:.2f}, {info['centroid'][2]:.2f}]")
    print(f"  Spawn:    [{info['spawn_position'][0]:.2f}, {info['spawn_position'][1]:.2f}, {info['spawn_position'][2]:.2f}]")
    print(f"  Bounds:   [{info['bounds_min'][0]:.2f}, {info['bounds_min'][1]:.2f}, {info['bounds_min'][2]:.2f}]")
    print(f"         to [{info['bounds_max'][0]:.2f}, {info['bounds_max'][1]:.2f}, {info['bounds_max'][2]:.2f}]")
    aligned_extent = info["bounds_max"] - info["bounds_min"]
    print(f"  Extent:   {aligned_extent[0]:.2f} x {aligned_extent[1]:.2f} x {aligned_extent[2]:.2f}")

    # Emit TypeScript config snippet
    scene_name = ply_path.stem
    print("\n" + "=" * 60)
    print("TYPESCRIPT CONFIG")
    print("=" * 60)
    print(f"""
  // {scene_name} — sceneRotation (Euler XYZ radians)
  sceneRotation: [{euler_rad[0]:.6f}, {euler_rad[1]:.6f}, {euler_rad[2]:.6f}],

  // Or apply quaternion directly: mesh.quaternion.set({quat[0]:.6f}, {quat[1]:.6f}, {quat[2]:.6f}, {quat[3]:.6f})

  // Camera spawn (centroid + 1.6m above floor)
  // position: [{info['spawn_position'][0]:.2f}, {info['spawn_position'][1]:.2f}, {info['spawn_position'][2]:.2f}]
""")

    # Plot if requested
    if args.plot:
        plot_path = args.plot_output or str(ply_path.with_suffix("")) + "_alignment.png"
        print("Generating alignment plots...")
        plot_alignment(points, R, plot_path)

    return 0


# ============================================================================
# FUTURE PIPELINE INTEGRATION
# ============================================================================
#
# This script should eventually be integrated into the SPZ conversion pipeline
# (scripts/ply_to_spz.py or a new scripts/convert_to_spz.py) so that every
# scene is auto-aligned before upload. The approach:
#
# 1. In the conversion pipeline, after loading the PLY:
#    a. Run find_floor_plane() to detect the floor
#    b. Compute the alignment rotation matrix R
#    c. Apply R to all splat positions: positions = (R @ positions.T).T
#    d. Apply R to all splat rotations (quaternions): for each splat quaternion q,
#       compute q_aligned = R_quat * q (quaternion multiplication)
#    e. Apply R to scale axes if using anisotropic scales with rotation
#
# 2. Store the applied rotation in the SPZ metadata (or a sidecar JSON) so the
#    viewer knows the scene is pre-aligned and doesn't need runtime rotation.
#
# 3. Camera spawn point: compute centroid + 1.6m above floor from the aligned
#    positions and store in the scene metadata.
#
# 4. The viewer would check for a `preAligned: true` flag and skip any
#    sceneRotation / coordinateSystem rotation if set.
#
# Benefits of pipeline integration vs. runtime rotation:
#   - No per-frame transform overhead (though minimal)
#   - Bounding boxes are axis-aligned → better frustum culling
#   - Spawn point is pre-computed → no need for per-scene config in code
#   - Consistent behavior regardless of viewer implementation
#
# Implementation priority: MEDIUM — the runtime sceneRotation approach works
# fine for now. Integrate when the conversion pipeline is stable and we have
# more than a handful of scenes.
# ============================================================================


if __name__ == "__main__":
    sys.exit(main())
