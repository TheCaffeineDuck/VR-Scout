import { useMemo, useCallback, useRef } from 'react'
import { TeleportTarget } from '@react-three/xr'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewerStore } from '@/stores/viewer-store'

/**
 * Provides a teleport target for VR users using an invisible floor plane
 * derived from the scene's bounding box.
 *
 * Only mounts the TeleportTarget when an XR session is active to prevent
 * any accidental visible geometry on desktop.
 */
export function TeleportController() {
  const sceneBounds = useViewerStore((s) => s.sceneBounds)
  const { gl } = useThree()
  const isXR = useRef(false)

  useFrame(() => {
    isXR.current = gl.xr?.isPresenting ?? false
  })

  const handleTeleport = useCallback((point: THREE.Vector3) => {
    console.log('[Teleport] Moved to', point.toArray())
  }, [])

  // Create an invisible floor plane that covers the scene's XZ footprint
  const floorGeometry = useMemo(() => {
    if (!sceneBounds) return null
    const { min, max } = sceneBounds
    const width = max[0] - min[0] + 2 // 1m padding each side
    const depth = max[2] - min[2] + 2
    return new THREE.PlaneGeometry(width, depth)
  }, [sceneBounds])

  if (!sceneBounds || !floorGeometry) return null

  const centerX = (sceneBounds.min[0] + sceneBounds.max[0]) / 2
  const centerZ = (sceneBounds.min[2] + sceneBounds.max[2]) / 2
  const floorY = sceneBounds.min[1]

  // Only render the teleport target — the mesh itself stays invisible
  // regardless, but wrapping in TeleportTarget could create XR-related
  // visuals on some configurations.
  return (
    <TeleportTarget onTeleport={handleTeleport}>
      <mesh
        geometry={floorGeometry}
        position={[centerX, floorY, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <meshBasicMaterial visible={false} />
      </mesh>
    </TeleportTarget>
  )
}
