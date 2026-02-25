import * as THREE from 'three'
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
  MeshBVH,
} from 'three-mesh-bvh'

// Extend Three.js prototypes for BVH support.
// The type assertions are needed because the library's exported function
// signatures don't exactly match the prototype method types, but this
// is the library's intended usage pattern.
/* eslint-disable @typescript-eslint/no-explicit-any */
;(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree
;(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree
;(THREE.Mesh.prototype as any).raycast = acceleratedRaycast
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Build BVH acceleration structures on all meshes in a scene group.
 * Call this after loading a scene for fast raycasting.
 */
export function buildSceneBVH(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      if (!child.geometry.boundsTree) {
        child.geometry.computeBoundsTree()
      }
    }
  })
}

/**
 * Dispose BVH structures from all meshes in a scene group.
 * Call before disposing the scene to free memory.
 */
export function disposeSceneBVH(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry?.boundsTree) {
      child.geometry.disposeBoundsTree()
    }
  })
}

/**
 * Raycast against a BVH-accelerated scene.
 * Returns all intersections sorted by distance (nearest first).
 */
export function raycastScene(
  raycaster: THREE.Raycaster,
  scene: THREE.Object3D,
): THREE.Intersection[] {
  return raycaster.intersectObject(scene, true)
}

/**
 * Raycast and return only the nearest intersection, or null.
 */
export function raycastNearest(
  raycaster: THREE.Raycaster,
  scene: THREE.Object3D,
): THREE.Intersection | null {
  raycaster.firstHitOnly = true
  const hits = raycaster.intersectObject(scene, true)
  raycaster.firstHitOnly = false
  return hits.length > 0 ? hits[0] : null
}

/**
 * Create a raycaster from screen coordinates (normalized device coordinates).
 */
export function createScreenRaycaster(
  ndc: THREE.Vector2,
  camera: THREE.Camera,
): THREE.Raycaster {
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, camera)
  return raycaster
}

// Re-export MeshBVH for advanced usage
export { MeshBVH }
