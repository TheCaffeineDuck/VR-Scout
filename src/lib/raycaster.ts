import * as THREE from 'three'

/**
 * Raycasting utilities.
 *
 * Spark's SplatMesh implements the standard THREE.Raycaster interface,
 * so these helpers work transparently with both splat scenes and
 * regular triangle meshes.
 */

/**
 * Raycast against a scene.
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
