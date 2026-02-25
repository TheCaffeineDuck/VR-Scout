import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { VirtualCamera } from '@/types/camera'
import { CINEMA_LENSES } from '@/types/camera'
import { useVirtualCameraStore } from '@/hooks/useVirtualCamera'

/**
 * 3D representation of a virtual camera in the scene.
 * Simple box + cone geometry showing position and direction.
 */
export function VirtualCameraObject({ cam }: { cam: VirtualCamera }) {
  const groupRef = useRef<THREE.Group>(null)
  const activeCameraId = useVirtualCameraStore((s) => s.activeCameraId)
  const setActiveCameraId = useVirtualCameraStore((s) => s.setActiveCameraId)
  const removeCamera = useVirtualCameraStore((s) => s.removeCamera)
  const isActive = activeCameraId === cam.id
  const lens = CINEMA_LENSES[cam.lensIndex]

  return (
    <group
      ref={groupRef}
      position={cam.position}
      rotation={cam.rotation}
    >
      {/* Camera body */}
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          setActiveCameraId(isActive ? null : cam.id)
        }}
      >
        <boxGeometry args={[0.15, 0.1, 0.2]} />
        <meshStandardMaterial
          color={isActive ? '#4f46e5' : '#374151'}
          emissive={isActive ? '#4f46e5' : '#000000'}
          emissiveIntensity={isActive ? 0.3 : 0}
        />
      </mesh>

      {/* Lens cone */}
      <mesh position={[0, 0, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.05, 0.1, 8]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>

      {/* Label */}
      <Html
        position={[0, 0.12, 0]}
        center
        distanceFactor={5}
        zIndexRange={[30, 0]}
      >
        <div className="text-[10px] text-white bg-black/70 px-1.5 py-0.5 rounded whitespace-nowrap select-none pointer-events-auto">
          <span className="font-medium">{lens.focalLength}mm</span>
          {isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); removeCamera(cam.id) }}
              className="ml-1.5 text-red-400 hover:text-red-300"
            >
              x
            </button>
          )}
        </div>
      </Html>
    </group>
  )
}
