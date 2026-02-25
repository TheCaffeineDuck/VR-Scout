import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, createPortal } from '@react-three/fiber'
import type { VirtualCamera } from '@/types/camera'
import { CINEMA_LENSES } from '@/types/camera'

const MONITOR_WIDTH = 0.4
const MONITOR_HEIGHT = 0.225 // 16:9 aspect
const RENDER_SIZE = 256
const RENDER_FPS = 15

/**
 * A floating quad that shows render-to-texture output of what a virtual camera sees.
 * Positioned near the virtual camera, above and to the right.
 */
export function FloatingMonitor({ cam }: { cam: VirtualCamera }) {
  const { scene, gl } = useThree()
  const meshRef = useRef<THREE.Mesh>(null)
  const lens = CINEMA_LENSES[cam.lensIndex]

  // Create render target and virtual camera
  const renderTarget = useMemo(
    () => new THREE.WebGLRenderTarget(RENDER_SIZE, Math.round(RENDER_SIZE * (9 / 16))),
    [],
  )

  const virtualCam = useMemo(() => {
    const c = new THREE.PerspectiveCamera(lens.fov, 16 / 9, 0.1, 500)
    c.position.set(...cam.position)
    c.rotation.set(...cam.rotation)
    return c
  }, [cam.position, cam.rotation, lens.fov])

  // Update virtual cam when props change
  useEffect(() => {
    virtualCam.position.set(...cam.position)
    virtualCam.rotation.set(...cam.rotation)
    virtualCam.fov = lens.fov
    virtualCam.updateProjectionMatrix()
  }, [cam.position, cam.rotation, lens.fov, virtualCam])

  // Dispose render target on unmount
  useEffect(() => {
    return () => renderTarget.dispose()
  }, [renderTarget])

  // Render to texture at reduced framerate
  const lastRenderTime = useRef(0)
  useFrame(({ clock }) => {
    const now = clock.getElapsedTime()
    if (now - lastRenderTime.current < 1 / RENDER_FPS) return
    lastRenderTime.current = now

    // Temporarily render from virtual camera POV
    const currentRT = gl.getRenderTarget()
    gl.setRenderTarget(renderTarget)
    gl.render(scene, virtualCam)
    gl.setRenderTarget(currentRT)
  })

  // Position the monitor above and slightly behind the camera
  const monitorPos: [number, number, number] = [
    cam.position[0],
    cam.position[1] + 0.25,
    cam.position[2],
  ]

  return (
    <group position={monitorPos}>
      {/* Monitor screen */}
      <mesh ref={meshRef}>
        <planeGeometry args={[MONITOR_WIDTH, MONITOR_HEIGHT]} />
        <meshBasicMaterial map={renderTarget.texture} />
      </mesh>
      {/* Border frame */}
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[MONITOR_WIDTH + 0.01, MONITOR_HEIGHT + 0.01]} />
        <meshBasicMaterial color="#1f2937" />
      </mesh>
    </group>
  )
}
