import * as THREE from 'three'
import { SplatMesh } from '@sparkjsdev/spark'
import type { SplatCoordinateSystem } from '@/types/scene'

export interface LoadSplatOptions {
  /** Coordinate system of the source data. Defaults to 'opencv'. */
  coordinateSystem?: SplatCoordinateSystem
  /** Additional Euler rotation [x, y, z] in radians applied after coordinate conversion. */
  sceneRotation?: [number, number, number]
}

/**
 * Load a Gaussian Splat scene via Spark's SplatMesh.
 *
 * Supports .spz (primary), .ply, .splat formats.
 * SplatMesh auto-detects file type from URL extension.
 *
 * Coordinate handling:
 * - 'opencv' (default): INRIA 3DGS / raw COLMAP output. Applies 180° X
 *   rotation to convert from Y-down to Three.js Y-up convention.
 * - 'opengl': Nerfstudio Splatfacto / already Y-up data. No rotation needed.
 *
 * Returns a THREE.Group containing the loaded SplatMesh.
 */
export async function loadSplatScene(
  url: string,
  onProgress?: (progress: number) => void,
  options?: LoadSplatOptions,
): Promise<THREE.Group> {
  const coordSys = options?.coordinateSystem ?? 'opencv'
  const group = new THREE.Group()
  group.name = 'splat-scene'

  const splatMesh = new SplatMesh({ url })

  // SplatMesh.initialized resolves when loading + GPU upload is done
  await splatMesh.initialized

  if (onProgress) {
    // Spark doesn't expose granular progress — report 100% on load
    onProgress(1)
  }

  // Apply coordinate system rotation
  if (coordSys === 'opencv') {
    // Re-orient from OpenCV (Y-down, Z-forward) to OpenGL (Y-up, Z-back).
    // quaternion.set(x, y, z, w) — (1,0,0,0) = 180° around X axis.
    splatMesh.quaternion.set(1, 0, 0, 0)
  }
  // 'opengl': no rotation needed — data is already Y-up

  // Apply optional additional rotation (e.g. for scene-specific correction)
  if (options?.sceneRotation) {
    const [rx, ry, rz] = options.sceneRotation
    const extraRot = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rx, ry, rz),
    )
    splatMesh.quaternion.premultiply(extraRot)
  }

  // SplatMesh uses InstancedBufferGeometry with a tiny quad — Three.js
  // computes a bounding sphere from that quad, not the splat cloud, so
  // frustum culling would incorrectly hide the mesh. Disable it.
  splatMesh.frustumCulled = false

  group.add(splatMesh)

  // Compute world-space bounding box.
  // getBoundingBox() returns local-space coords. We need to transform to
  // world space based on the applied rotation.
  const localBbox = splatMesh.getBoundingBox()

  let bbox: THREE.Box3
  if (coordSys === 'opencv' && !options?.sceneRotation) {
    // Fast path: 180° X rotation just negates Y and Z
    bbox = new THREE.Box3(
      new THREE.Vector3(localBbox.min.x, -localBbox.max.y, -localBbox.max.z),
      new THREE.Vector3(localBbox.max.x, -localBbox.min.y, -localBbox.min.z),
    )
  } else {
    // General path: transform all 8 corners of the local bbox
    const corners = [
      new THREE.Vector3(localBbox.min.x, localBbox.min.y, localBbox.min.z),
      new THREE.Vector3(localBbox.max.x, localBbox.min.y, localBbox.min.z),
      new THREE.Vector3(localBbox.min.x, localBbox.max.y, localBbox.min.z),
      new THREE.Vector3(localBbox.max.x, localBbox.max.y, localBbox.min.z),
      new THREE.Vector3(localBbox.min.x, localBbox.min.y, localBbox.max.z),
      new THREE.Vector3(localBbox.max.x, localBbox.min.y, localBbox.max.z),
      new THREE.Vector3(localBbox.min.x, localBbox.max.y, localBbox.max.z),
      new THREE.Vector3(localBbox.max.x, localBbox.max.y, localBbox.max.z),
    ]
    bbox = new THREE.Box3()
    for (const c of corners) {
      c.applyQuaternion(splatMesh.quaternion)
      bbox.expandByPoint(c)
    }
  }

  const size = new THREE.Vector3()
  bbox.getSize(size)

  // Store world-space bounding box on the group so placeScene can use it
  group.userData.splatBounds = bbox

  console.log(
    `[loadSplatScene] Loaded ${url} (${coordSys}) — ` +
    `splats=${splatMesh.packedSplats.numSplats.toLocaleString()}, ` +
    `bounds=(${size.x.toFixed(1)}, ${size.y.toFixed(1)}, ${size.z.toFixed(1)})`,
  )

  return group
}

/**
 * Dispose a splat scene group and its resources.
 */
export function disposeScene(group: THREE.Group) {
  let disposed = 0

  group.traverse((child) => {
    if (child instanceof SplatMesh) {
      child.dispose()
      disposed++
    } else if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material.dispose()
      }
      disposed++
    }
  })

  console.debug(`[disposeScene] Disposed ${disposed} objects`)
}
