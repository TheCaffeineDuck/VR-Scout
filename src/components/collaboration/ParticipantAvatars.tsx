import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useParticipantPresenceStore } from '@/stores/participant-store'
import { useSessionStore } from '@/stores/session-store'

interface AvatarProps {
  uid: string
  displayName: string
  avatarColor: string
  position: [number, number, number]
  rotation: [number, number, number]
  isSpeaking: boolean
}

function RemoteAvatar({ displayName, avatarColor, position, rotation, isSpeaking }: AvatarProps) {
  const groupRef = useRef<THREE.Group>(null)
  const targetPos = useRef(new THREE.Vector3(...position))
  const targetRot = useRef(new THREE.Euler(rotation[0], rotation[1], rotation[2]))

  // Smooth interpolation to target position/rotation
  useFrame((_, delta) => {
    if (!groupRef.current) return
    const lerp = 1 - Math.pow(0.001, delta) // smooth ~10Hz updates
    groupRef.current.position.lerp(targetPos.current, lerp)
    groupRef.current.rotation.x += (targetRot.current.x - groupRef.current.rotation.x) * lerp
    groupRef.current.rotation.y += (targetRot.current.y - groupRef.current.rotation.y) * lerp
  })

  // Update targets when props change
  targetPos.current.set(...position)
  targetRot.current.set(rotation[0], rotation[1], rotation[2])

  return (
    <group ref={groupRef} position={position}>
      {/* Body cone */}
      <mesh position={[0, 0.5, 0]}>
        <coneGeometry args={[0.25, 1.0, 8]} />
        <meshStandardMaterial color={avatarColor} />
      </mesh>

      {/* Head sphere */}
      <mesh position={[0, 1.15, 0]}>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial color={avatarColor} />
      </mesh>

      {/* Speaking indicator ring */}
      {isSpeaking && (
        <mesh position={[0, 1.15, 0]}>
          <ringGeometry args={[0.22, 0.28, 16]} />
          <meshBasicMaterial color="#4ade80" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}

      {/* Facing direction indicator */}
      <mesh position={[0, 1.15, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.06, 0.15, 4]} />
        <meshStandardMaterial color={avatarColor} emissive={avatarColor} emissiveIntensity={0.3} />
      </mesh>

      {/* Name label */}
      <Billboard position={[0, 1.55, 0]}>
        <Text
          fontSize={0.12}
          color="white"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.015}
          outlineColor="black"
        >
          {displayName}
        </Text>
      </Billboard>
    </group>
  )
}

export function ParticipantAvatars() {
  const remoteParticipants = useParticipantPresenceStore((s) => s.remoteParticipants)
  const currentSession = useSessionStore((s) => s.currentSession)

  if (!currentSession) return null

  const entries = Object.entries(remoteParticipants)
  if (entries.length === 0) return null

  return (
    <>
      {entries.map(([uid, state]) => (
        <RemoteAvatar
          key={uid}
          uid={uid}
          displayName={state.displayName}
          avatarColor={state.avatarColor}
          position={state.position}
          rotation={state.rotation}
          isSpeaking={state.isSpeaking}
        />
      ))}
    </>
  )
}
