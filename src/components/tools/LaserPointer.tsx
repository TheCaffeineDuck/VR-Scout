import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useToolStore } from '@/stores/tool-store'
import { useViewerStore } from '@/stores/viewer-store'
import { raycastNearest } from '@/lib/raycaster'

const LASER_COLOR = '#ff3333'
const DOT_SIZE = 0.03

/**
 * Laser pointer tool. When active (L key held), draws a beam from
 * the camera to the scene hit point with a glowing dot.
 */
export function LaserPointer() {
  const laserActive = useToolStore((s) => s.laserActive)
  const setLaserActive = useToolStore((s) => s.setLaserActive)
  const sceneGroup = useViewerStore((s) => s.sceneGroup)
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const mouseRef = useRef({ x: 0, y: 0 })

  const lineGeomRef = useRef<THREE.BufferGeometry>(null)
  const dotRef = useRef<THREE.Group>(null)
  const groupRef = useRef<THREE.Group>(null)

  // Track mouse
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    gl.domElement.addEventListener('mousemove', onMove)
    return () => gl.domElement.removeEventListener('mousemove', onMove)
  }, [gl])

  // Key hold for laser activation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyL' && !e.repeat) setLaserActive(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyL') setLaserActive(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [setLaserActive])

  // Update laser beam every frame
  useFrame(() => {
    if (!laserActive || !sceneGroup || !groupRef.current) {
      if (groupRef.current) groupRef.current.visible = false
      return
    }

    groupRef.current.visible = true

    ndc.set(mouseRef.current.x, mouseRef.current.y)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycastNearest(raycaster, sceneGroup)

    if (!hit) {
      groupRef.current.visible = false
      return
    }

    const start = camera.position
    const end = hit.point

    // Update line
    if (lineGeomRef.current) {
      const pos = lineGeomRef.current.getAttribute('position')
      if (pos) {
        pos.setXYZ(0, start.x, start.y, start.z)
        pos.setXYZ(1, end.x, end.y, end.z)
        pos.needsUpdate = true
      }
    }

    // Update dot
    if (dotRef.current) {
      dotRef.current.position.copy(end)
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* Beam line */}
      <line>
        <bufferGeometry ref={lineGeomRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(6), 3]}
            count={2}
          />
        </bufferGeometry>
        <lineBasicMaterial color={LASER_COLOR} transparent opacity={0.6} />
      </line>

      {/* Hit dot + glow */}
      <group ref={dotRef}>
        <mesh>
          <sphereGeometry args={[DOT_SIZE, 8, 8]} />
          <meshBasicMaterial color={LASER_COLOR} />
        </mesh>
        <mesh>
          <sphereGeometry args={[DOT_SIZE * 2.5, 8, 8]} />
          <meshBasicMaterial color={LASER_COLOR} transparent opacity={0.25} />
        </mesh>
      </group>
    </group>
  )
}
