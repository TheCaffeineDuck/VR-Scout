import { useMemo } from 'react';
import * as THREE from 'three';

interface CameraFrustumProps {
  position: [number, number, number];
  rotationMatrix: number[][];
  color: string;
  scale?: number;
}

/**
 * Wireframe camera frustum rendered as THREE.LineSegments.
 *
 * COLMAP convention: camera looks along +Z, so the frustum pyramid
 * extends in the +Z direction from the camera position.
 * 5 vertices (apex at origin + 4 base corners), 8 line segments.
 */
export function CameraFrustum({
  position,
  rotationMatrix,
  color,
  scale = 0.1,
}: CameraFrustumProps) {
  const { geometry, material, matrix } = useMemo(() => {
    // Frustum in camera-local space (apex at origin, base at +Z)
    const hw = scale * 0.5; // half-width of base
    const hh = scale * 0.375; // half-height (4:3 aspect)
    const d = scale; // depth

    // Apex (camera position in local coords)
    const apex = new THREE.Vector3(0, 0, 0);
    // Base corners
    const bl = new THREE.Vector3(-hw, -hh, d);
    const br = new THREE.Vector3(hw, -hh, d);
    const tr = new THREE.Vector3(hw, hh, d);
    const tl = new THREE.Vector3(-hw, hh, d);

    // 8 line segments: 4 from apex to corners, 4 connecting base
    const vertices = new Float32Array([
      // Apex to corners
      apex.x, apex.y, apex.z, bl.x, bl.y, bl.z,
      apex.x, apex.y, apex.z, br.x, br.y, br.z,
      apex.x, apex.y, apex.z, tr.x, tr.y, tr.z,
      apex.x, apex.y, apex.z, tl.x, tl.y, tl.z,
      // Base rectangle
      bl.x, bl.y, bl.z, br.x, br.y, br.z,
      br.x, br.y, br.z, tr.x, tr.y, tr.z,
      tr.x, tr.y, tr.z, tl.x, tl.y, tl.z,
      tl.x, tl.y, tl.z, bl.x, bl.y, bl.z,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const mat = new THREE.LineBasicMaterial({ color });

    // Build world transform from COLMAP rotation matrix + position
    // The rotation_matrix from the API is the camera-to-world rotation (R^T from COLMAP)
    // Actually, our API returns R from the quaternion (world-to-camera rotation).
    // Camera world position was computed as -R^T * t.
    // To orient the frustum in world space, we need R^T (camera-to-world).
    const r = rotationMatrix;
    const m = new THREE.Matrix4();
    // R^T (transpose) to go from camera space to world space
    m.set(
      r[0][0], r[1][0], r[2][0], position[0],
      r[0][1], r[1][1], r[2][1], position[1],
      r[0][2], r[1][2], r[2][2], position[2],
      0, 0, 0, 1,
    );

    return { geometry: geo, material: mat, matrix: m };
  }, [position, rotationMatrix, color, scale]);

  return (
    <lineSegments
      geometry={geometry}
      material={material}
      matrixAutoUpdate={false}
      matrix={matrix}
    />
  );
}
