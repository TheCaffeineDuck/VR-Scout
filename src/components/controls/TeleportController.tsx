import { useRef, useCallback } from 'react'
import { TeleportTarget } from '@react-three/xr'
import * as THREE from 'three'
import { useViewerStore } from '@/stores/viewer-store'

/**
 * Wraps the loaded scene in a TeleportTarget so VR users
 * can aim + click the thumbstick to teleport onto the scene geometry.
 * The XR locomotion system handles the arc pointer rendering.
 */
export function TeleportController() {
  const sceneGroup = useViewerStore((s) => s.sceneGroup)
  const originRef = useRef<THREE.Group>(null)

  const handleTeleport = useCallback((point: THREE.Vector3) => {
    // TeleportTarget from @react-three/xr handles moving the XROrigin
    // This callback is just for optional side effects (sound, visual feedback)
    console.log('[Teleport] Moved to', point.toArray())
  }, [])

  if (!sceneGroup) return null

  return (
    <TeleportTarget onTeleport={handleTeleport}>
      {/* Re-render scene group as teleport target - the actual scene meshes */}
      <primitive object={sceneGroup} />
    </TeleportTarget>
  )
}
