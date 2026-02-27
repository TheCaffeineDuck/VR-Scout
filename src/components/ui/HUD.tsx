import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useToolStore } from '@/stores/tool-store'
import { useSessionStore } from '@/stores/session-store'
import { useMeasurementStore } from '@/hooks/useMeasurement'

const HUD_DISTANCE = 0.6
const HUD_OFFSET_Y = -0.15
const HUD_OFFSET_X = -0.25

/**
 * In-VR heads-up display anchored to the user's view.
 * Shows: active tool, participant count, last measurement readout.
 * Positioned in the lower-left of the user's field of view.
 * Only renders when an XR session is active (VR mode).
 */
export function HUD() {
  const { camera, gl } = useThree()
  const groupRef = useRef<THREE.Group>(null)
  const isXR = useRef(false)

  // Track XR state — only show HUD in VR
  useFrame(() => {
    isXR.current = gl.xr?.isPresenting ?? false
  })

  const activeTool = useToolStore((s) => s.activeTool)
  const measurementUnit = useToolStore((s) => s.measurementUnit)
  const participants = useSessionStore((s) => s.participants)
  const measurements = useMeasurementStore((s) => s.measurements)

  const lastMeasurement = measurements.length > 0 ? measurements[measurements.length - 1] : null
  const lastDistance = lastMeasurement
    ? measurementUnit === 'feet'
      ? `${(lastMeasurement.distance * 3.28084).toFixed(2)} ft`
      : `${lastMeasurement.distance.toFixed(2)} m`
    : null

  const hudDir = useRef(new THREE.Vector3())
  const hudRight = useRef(new THREE.Vector3())
  const hudUp = useRef(new THREE.Vector3())

  // Follow camera with offset (only when in VR)
  useFrame(() => {
    if (!groupRef.current || !isXR.current) {
      if (groupRef.current) groupRef.current.visible = false
      return
    }

    groupRef.current.visible = true
    camera.getWorldDirection(hudDir.current)

    // HUD slightly below and to the left of center gaze
    hudRight.current.crossVectors(hudDir.current, camera.up).normalize()
    hudUp.current.crossVectors(hudRight.current, hudDir.current).normalize()

    groupRef.current.position
      .copy(camera.position)
      .add(hudDir.current.multiplyScalar(HUD_DISTANCE))
      .add(hudRight.current.multiplyScalar(HUD_OFFSET_X))
      .add(hudUp.current.multiplyScalar(HUD_OFFSET_Y))

    groupRef.current.lookAt(camera.position)
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* Background panel */}
      <mesh>
        <planeGeometry args={[0.18, 0.08]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Active tool */}
      <Text
        position={[-0.07, 0.02, 0.001]}
        fontSize={0.012}
        color="#a5b4fc"
        anchorX="left"
        anchorY="middle"
      >
        {`Tool: ${activeTool}`}
      </Text>

      {/* Participant count */}
      <Text
        position={[-0.07, 0.003, 0.001]}
        fontSize={0.01}
        color="#9ca3af"
        anchorX="left"
        anchorY="middle"
      >
        {`Users: ${participants.length}`}
      </Text>

      {/* Last measurement */}
      {lastDistance && (
        <Text
          position={[-0.07, -0.015, 0.001]}
          fontSize={0.01}
          color="#fbbf24"
          anchorX="left"
          anchorY="middle"
        >
          {`Last: ${lastDistance}`}
        </Text>
      )}

      {/* Unit indicator */}
      <Text
        position={[0.07, -0.028, 0.001]}
        fontSize={0.008}
        color="#6b7280"
        anchorX="right"
        anchorY="middle"
      >
        {measurementUnit}
      </Text>
    </group>
  )
}
