import { useEffect, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useVirtualCameraStore } from '@/hooks/useVirtualCamera'

/**
 * Button to spawn a new virtual camera at the current viewer position.
 * Max 3 cameras enforced.
 */
export function CameraSpawnButton() {
  const cameras = useVirtualCameraStore((s) => s.cameras)
  const canSpawn = cameras.length < 3

  return (
    <button
      onClick={() => {
        window.dispatchEvent(new CustomEvent('spawn-virtual-camera'))
      }}
      disabled={!canSpawn}
      className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
        canSpawn
          ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
      }`}
      title={canSpawn ? 'Spawn camera at current position' : 'Max 3 cameras'}
    >
      + Camera ({cameras.length}/3)
    </button>
  )
}

/**
 * R3F component that listens for spawn events and creates cameras
 * at the current viewer camera position.
 */
export function CameraSpawnListener() {
  const { camera } = useThree()
  const addCamera = useVirtualCameraStore((s) => s.addCamera)

  const handleSpawn = useCallback(() => {
    const pos = camera.position.toArray() as [number, number, number]
    const rot = camera.rotation.toArray().slice(0, 3) as [number, number, number]

    // Place camera 2m in front of the viewer
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const spawnPos: [number, number, number] = [
      pos[0] + dir.x * 2,
      pos[1],
      pos[2] + dir.z * 2,
    ]

    addCamera({
      id: crypto.randomUUID(),
      position: spawnPos,
      rotation: rot,
      lensIndex: 2, // Default: 35mm Standard
      placedBy: 'local',
    })
  }, [camera, addCamera])

  useEffect(() => {
    window.addEventListener('spawn-virtual-camera', handleSpawn)
    return () => window.removeEventListener('spawn-virtual-camera', handleSpawn)
  }, [handleSpawn])

  return null
}
