import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useCollaboration } from '@/hooks/useCollaboration'

const BROADCAST_INTERVAL = 1 / 10 // 10 Hz

export function PositionBroadcaster() {
  const { camera } = useThree()
  const { broadcastPosition, connectionStatus } = useCollaboration()
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    if (connectionStatus !== 'connected') return

    elapsed.current += delta
    if (elapsed.current < BROADCAST_INTERVAL) return
    elapsed.current = 0

    const pos: [number, number, number] = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ]
    const rot: [number, number, number] = [
      camera.rotation.x,
      camera.rotation.y,
      camera.rotation.z,
    ]

    broadcastPosition(pos, rot)
  })

  return null
}
