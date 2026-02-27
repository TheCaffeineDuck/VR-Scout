import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { VirtualCamera } from '@/types/camera'
import { CINEMA_LENSES } from '@/types/camera'

const MONITOR_WIDTH = 0.4
const MONITOR_HEIGHT = 0.225 // 16:9 aspect
const RENDER_SIZE_DESKTOP = 512
const RENDER_SIZE_VR = 256
const RENDER_FPS_DESKTOP = 15
const RENDER_INTERVAL_VR_FRAMES = 3 // render every Nth frame in VR

/**
 * A floating quad that shows render-to-texture output of what a virtual camera sees.
 * Positioned near the virtual camera, above and to the right.
 *
 * Performance guards:
 * - Desktop: renders at 15fps into 512px target
 * - VR: renders every 3rd frame into 256px target to stay within draw call budget
 */
export function FloatingMonitor({ cam }: { cam: VirtualCamera }) {
  const { scene, gl } = useThree()
  const meshRef = useRef<THREE.Mesh>(null)
  const lens = CINEMA_LENSES[cam.lensIndex]
  const prevCamRef = useRef<THREE.PerspectiveCamera | null>(null)

  // Detect VR mode via XR session on the renderer
  const isVR = useRef(false)
  useFrame(() => {
    isVR.current = gl.xr?.isPresenting ?? false
  })

  // Create render target for secondary camera view.
  // gl.render(scene, virtualCam) works with Spark because SparkRenderer
  // is added to the scene and hooks into onBeforeRender automatically.
  const renderTarget = useMemo(() => {
    const size = isVR.current ? RENDER_SIZE_VR : RENDER_SIZE_DESKTOP
    return new THREE.WebGLRenderTarget(size, Math.round(size * (9 / 16)))
  }, [])

  const virtualCam = useMemo(() => {
    const c = new THREE.PerspectiveCamera(lens.fov, 16 / 9, 0.1, 500)
    c.position.set(...cam.position)
    c.rotation.set(...cam.rotation)
    return c
  }, [cam.position, cam.rotation, lens.fov])

  // Dispose previous camera when virtualCam is recreated
  useEffect(() => {
    const prev = prevCamRef.current
    if (prev && prev !== virtualCam) {
      prev.removeFromParent()
    }
    prevCamRef.current = virtualCam
  }, [virtualCam])

  // Update virtual cam when props change
  useEffect(() => {
    virtualCam.position.set(...cam.position)
    virtualCam.rotation.set(...cam.rotation)
    virtualCam.fov = lens.fov
    virtualCam.updateProjectionMatrix()
  }, [cam.position, cam.rotation, lens.fov, virtualCam])

  // Dispose render target and camera on unmount
  useEffect(() => {
    return () => {
      renderTarget.dispose()
      if (prevCamRef.current) {
        prevCamRef.current.removeFromParent()
        prevCamRef.current = null
      }
    }
  }, [renderTarget])

  // Render to texture at reduced framerate
  const lastRenderTime = useRef(0)
  const frameCounter = useRef(0)
  useFrame(({ clock }) => {
    frameCounter.current++

    if (isVR.current) {
      // In VR: render every Nth frame to conserve draw calls
      if (frameCounter.current % RENDER_INTERVAL_VR_FRAMES !== 0) return
    } else {
      // Desktop: time-based throttle
      const now = clock.getElapsedTime()
      if (now - lastRenderTime.current < 1 / RENDER_FPS_DESKTOP) return
      lastRenderTime.current = now
    }

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
