import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { useToolStore } from '@/stores/tool-store'
import { useViewerStore } from '@/stores/viewer-store'

export function FirstPersonControls() {
  const { camera } = useThree()
  const activeTool = useToolStore((s) => s.activeTool)
  const sceneBounds = useViewerStore((s) => s.sceneBounds)
  const keys = useRef<Set<string>>(new Set())
  const direction = useRef(new THREE.Vector3())
  const frontVector = useRef(new THREE.Vector3())
  const sideVector = useRef(new THREE.Vector3())
  const moveVector = useRef(new THREE.Vector3())

  // Derive movement speed from scene size so navigation feels natural
  // regardless of COLMAP's arbitrary scale.
  const sceneScale = sceneBounds
    ? Math.max(
        sceneBounds.max[0] - sceneBounds.min[0],
        sceneBounds.max[2] - sceneBounds.min[2],
      )
    : 10
  // Walk across the scene's longest floor axis in ~15s, sprint in ~7s
  const walkSpeed = sceneScale / 15
  const sprintSpeed = sceneScale / 7

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keys.current.add(e.code)
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useFrame((_, delta) => {
    const pressed = keys.current
    const speed = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? sprintSpeed : walkSpeed

    // Forward/backward
    const forward = (pressed.has('KeyW') ? 1 : 0) - (pressed.has('KeyS') ? 1 : 0)
    // Left/right
    const strafe = (pressed.has('KeyD') ? 1 : 0) - (pressed.has('KeyA') ? 1 : 0)

    if (forward === 0 && strafe === 0) return

    // Get camera direction projected onto XZ plane
    camera.getWorldDirection(direction.current)
    frontVector.current.set(direction.current.x, 0, direction.current.z).normalize()
    sideVector.current.crossVectors(frontVector.current, camera.up).normalize()

    // Combine movement vectors
    moveVector.current
      .set(0, 0, 0)
      .addScaledVector(frontVector.current, forward)
      .addScaledVector(sideVector.current, strafe)
      .normalize()
      .multiplyScalar(speed * delta)

    camera.position.add(moveVector.current)
    // No Y-lock — let the user move freely through the scene
    // (COLMAP scale is arbitrary so a fixed eye-height doesn't make sense)
  })

  // Only enable pointer lock for navigation mode
  const enablePointerLock = activeTool === 'navigate'

  return enablePointerLock ? <PointerLockControls makeDefault /> : null
}
