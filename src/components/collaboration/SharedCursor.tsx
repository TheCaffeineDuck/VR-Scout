import { Line } from '@react-three/drei'
import { useParticipantPresenceStore } from '@/stores/participant-store'
import { useSessionStore } from '@/stores/session-store'

/**
 * Renders remote participants' laser pointers as visible beams in 3D space.
 * Each participant with a non-null laserTarget gets a colored beam from their position
 * to the target point, plus a glow dot at the intersection.
 */
export function SharedCursor() {
  const remoteParticipants = useParticipantPresenceStore((s) => s.remoteParticipants)
  const currentSession = useSessionStore((s) => s.currentSession)

  if (!currentSession) return null

  const entries = Object.entries(remoteParticipants).filter(
    ([_, state]) => state.laserTarget !== null,
  )

  if (entries.length === 0) return null

  return (
    <>
      {entries.map(([uid, state]) => {
        if (!state.laserTarget) return null
        return (
          <RemoteLaser
            key={uid}
            position={state.position}
            target={state.laserTarget}
            color={state.avatarColor}
          />
        )
      })}
    </>
  )
}

function RemoteLaser({
  position,
  target,
  color,
}: {
  position: [number, number, number]
  target: [number, number, number]
  color: string
}) {
  return (
    <group>
      {/* Laser beam */}
      <Line points={[position, target]} color={color} lineWidth={1} transparent opacity={0.6} />

      {/* Glow dot at target */}
      <mesh position={target}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={target}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
    </group>
  )
}
