/**
 * SplatDemo — Minimal R3F scene using TSLSplatRenderer.
 *
 * This file is a reference implementation and smoke-test. It is NOT part of the
 * standalone Vite app (it is not imported from main.ts). It is intended to be
 * copy-pasted into a consuming R3F application (e.g. VR Scout Phase D+).
 *
 * To compile and run this in an R3F project you also need the bundler aliases
 * described in src/r3f/index.ts.
 *
 * Peer dependencies required in the consuming app:
 *   react, react-dom, @react-three/fiber, @react-three/drei, three
 */

import { useRef, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { TSLSplatRenderer } from './index'
import type { CameraHint, SplatMeshPublicAPI } from './index'

/**
 * Minimal splat viewer — loads a single splat file and sets up OrbitControls
 * from the camera hint produced by the renderer's bounds analysis.
 *
 * Replace `url` with the path to your own .splat or .ply file.
 */
export function SplatDemo() {
  // Keep a ref to OrbitControls so the camera hint callback can set the target
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const handleCameraHint = useCallback((hint: CameraHint) => {
    console.log('[SplatDemo] Camera hint received:', hint)
    // In a real app you might tween to these values instead of snapping.
    // In XR mode you would skip this entirely — the headset drives the camera.
    if (controlsRef.current) {
      controlsRef.current.target.copy(hint.target)
      // Note: OrbitControls.object is the camera — copy the suggested position.
      controlsRef.current.object.position.copy(hint.position)
      controlsRef.current.update()
    }
  }, [])

  const handleLoad = useCallback((mesh: SplatMeshPublicAPI) => {
    console.log(`[SplatDemo] Loaded ${mesh.splatCount} splats`)
    console.log('[SplatDemo] Bounding box:', mesh.boundingBox)
  }, [])

  const handleError = useCallback((err: Error) => {
    console.error('[SplatDemo] Splat load error:', err)
  }, [])

  const handleProgress = useCallback((pct: number) => {
    console.log(`[SplatDemo] LOD progress: ${pct}%`)
  }, [])

  return (
    <Canvas
      // Use WebGPURenderer in the consuming app — pass your renderer config here.
      // With @react-three/fiber 9.x you can pass a custom renderer:
      //   gl={(canvas) => new WebGPURenderer({ canvas, antialias: true })}
      // For this reference demo we let R3F use its default WebGLRenderer so the
      // file compiles without additional setup. The splat will use CPU sort in
      // WebGL mode (still correct, just slower on large scenes).
      camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 1.6, 3] }}
    >
      {/* Minimal lighting — splats are unlit (emissive), but other scene objects
          may need lights. */}
      <ambientLight intensity={0.5} />

      <TSLSplatRenderer
        url="/splats/room.splat"
        onCameraHint={handleCameraHint}
        onLoad={handleLoad}
        onError={handleError}
        onProgress={handleProgress}
      />

      {/* OrbitControls — ref lets the camera hint callback set the target */}
      <OrbitControls ref={controlsRef} enableDamping />
    </Canvas>
  )
}

/**
 * Example of using the lower-level useSplatMesh hook instead.
 *
 * Use this pattern when you need direct access to the SplatMesh instance,
 * e.g. to call triggerInitialSort() or read internal state for debugging.
 */
export function SplatDemoWithHook() {
  // Import useSplatMesh at the top of your actual file:
  // import { useSplatMesh } from 'tsl-splat-renderer/src/r3f'
  //
  // This component is intentionally not implemented here to keep the demo
  // self-contained. See useSplatMesh.ts for the full API.
  return null
}
