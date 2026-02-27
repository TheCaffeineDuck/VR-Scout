import * as THREE from 'three'
import { SplatMesh } from '@sparkjsdev/spark'

/**
 * Load a Gaussian Splat scene via Spark's SplatMesh.
 *
 * Supports .spz (primary), .ply, .splat formats.
 * SplatMesh auto-detects file type from URL extension.
 *
 * Returns a THREE.Group containing the loaded SplatMesh.
 * The group wrapper lets useScene swap it into the scene graph
 * consistently with the old pipeline.
 */
export async function loadSplatScene(
  url: string,
  onProgress?: (progress: number) => void,
): Promise<THREE.Group> {
  const group = new THREE.Group()
  group.name = 'splat-scene'

  const splatMesh = new SplatMesh({ url })

  // SplatMesh.initialized resolves when loading + GPU upload is done
  await splatMesh.initialized

  if (onProgress) {
    // Spark doesn't expose granular progress — report 100% on load
    onProgress(1)
  }

  group.add(splatMesh)

  const bbox = splatMesh.getBoundingBox()
  const size = new THREE.Vector3()
  bbox.getSize(size)
  console.log(
    `[loadSplatScene] Loaded ${url} — ` +
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
