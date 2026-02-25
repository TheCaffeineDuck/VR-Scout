import { useVirtualCameraStore } from '@/hooks/useVirtualCamera'
import { VirtualCameraObject } from './VirtualCameraObject'
import { FloatingMonitor } from './FloatingMonitor'
import { CameraSpawnListener } from './CameraSpawnMenu'

/**
 * Manages rendering of all virtual cameras and their monitors.
 * Place inside Canvas/XR.
 */
export function CameraManager() {
  const cameras = useVirtualCameraStore((s) => s.cameras)

  return (
    <group>
      <CameraSpawnListener />
      {cameras.map((cam) => (
        <group key={cam.id}>
          <VirtualCameraObject cam={cam} />
          <FloatingMonitor cam={cam} />
        </group>
      ))}
    </group>
  )
}
