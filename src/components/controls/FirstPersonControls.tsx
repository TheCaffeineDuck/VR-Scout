import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { useToolStore } from '@/stores/tool-store'

const WALK_SPEED = 4 // m/s
const SPRINT_SPEED = 8 // m/s
const EYE_HEIGHT = 1.6 // meters

export function FirstPersonControls() {
  const { camera } = useThree()
  const activeTool = useToolStore((s) => s.activeTool)
  const keys = useRef<Set<string>>(new Set())
  const direction = useRef(new THREE.Vector3())
  const frontVector = useRef(new THREE.Vector3())
  const sideVector = useRef(new THREE.Vector3())

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
    const speed = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED

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
    const moveVector = new THREE.Vector3()
      .addScaledVector(frontVector.current, forward)
      .addScaledVector(sideVector.current, strafe)
      .normalize()
      .multiplyScalar(speed * delta)

    camera.position.add(moveVector)
    // Lock eye height
    camera.position.y = EYE_HEIGHT
  })

  // Only enable pointer lock for navigation mode
  const enablePointerLock = activeTool === 'navigate'

  return enablePointerLock ? <PointerLockControls makeDefault /> : null
}
