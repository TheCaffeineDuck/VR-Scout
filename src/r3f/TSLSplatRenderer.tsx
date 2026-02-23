/**
 * TSLSplatRenderer — R3F component for rendering Gaussian splat scenes.
 *
 * ─── Three.js import resolution ───────────────────────────────────────────────
 * The standalone renderer imports from 'three/webgpu' and 'three/tsl'.
 * R3F imports from 'three'. To avoid "Multiple instances of Three.js" warnings
 * (and subtler bugs like mismatched Object3D constructors) the consuming app's
 * bundler MUST deduplicate all Three.js entry points to the same module graph.
 *
 * In the consuming app's vite.config.ts add:
 * ```ts
 * resolve: {
 *   alias: {
 *     'three/webgpu': 'three/src/Three.WebGPU.js',
 *     'three/tsl':    'three/src/Three.TSL.js',
 *   },
 *   dedupe: ['three'],
 * }
 * ```
 * Without this, `splatMesh instanceof THREE.Object3D` returns false inside R3F
 * and `<primitive>` silently fails to attach the mesh to the scene.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Vector3, Euler, Box3 } from 'three'
import { SplatMesh } from '../SplatMesh'
import type { TSLSplatRendererProps, SplatMeshPublicAPI, CameraHint } from './types'

/**
 * Drop-in R3F component for rendering a Gaussian splat file inside any R3F scene.
 *
 * The component:
 * 1. Creates a `SplatMesh` on mount and disposes it on unmount or URL change
 * 2. Passes R3F's `gl` (cast to WebGPURenderer) via `setRenderer()` before loading
 * 3. Calls `splatMesh.update(camera)` every frame to drive sorting
 * 4. After load, fires `onCameraHint` with suggested camera placement so the parent
 *    can set orbit controls target, move the camera, or ignore it in XR mode
 * 5. Uses `<primitive object={splatMesh}>` to attach the raw Object3D to the scene
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <TSLSplatRenderer
 *     url="/splats/room.splat"
 *     onCameraHint={({ position, target }) => {
 *       camera.position.copy(position)
 *       controls.target.copy(target)
 *       controls.update()
 *     }}
 *     onLoad={(mesh) => console.log(`Loaded ${mesh.splatCount} splats`)}
 *     onError={(err) => console.error(err)}
 *   />
 *   <OrbitControls />
 * </Canvas>
 * ```
 */
export function TSLSplatRenderer({
  url,
  position,
  rotation,
  scale,
  onLoad,
  onProgress,
  onError,
  onCameraHint,
}: TSLSplatRendererProps) {
  const { gl, camera, scene } = useThree()

  // Stable refs — avoid stale closures in useEffect cleanup and useFrame
  const meshRef = useRef<SplatMesh | null>(null)
  const onLoadRef = useRef(onLoad)
  const onProgressRef = useRef(onProgress)
  const onErrorRef = useRef(onError)
  const onCameraHintRef = useRef(onCameraHint)

  // Keep callback refs up to date without re-running the load effect
  useEffect(() => { onLoadRef.current = onLoad }, [onLoad])
  useEffect(() => { onProgressRef.current = onProgress }, [onProgress])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onCameraHintRef.current = onCameraHint }, [onCameraHint])

  // ── Main lifecycle effect: create → load → dispose on url change / unmount ──
  useEffect(() => {
    let cancelled = false

    const mesh = new SplatMesh()

    // Apply transform props before loading so centerOnBounds() can still override
    // position/rotation to centre the splat. User-supplied transforms are stacked
    // on top of what centerOnBounds sets (via a parent group — see <primitive> below).
    // Here we apply them to a wrapper handled further down. For simplicity we apply
    // them directly and document that they layer on top of the auto-centring.

    // Cast gl to WebGPURenderer. R3F types gl as WebGLRenderer, but when the app
    // uses <Canvas gl={{ ...WebGPURenderer options... }}> the runtime object is a
    // WebGPURenderer. The bundler alias ensures it is the same Three.js instance.
    // WebGPURenderer is not exported from @types/three, so we cast through any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mesh.setRenderer(gl as any)

    mesh.onLoadProgress = (pct: number) => {
      if (!cancelled) onProgressRef.current?.(pct)
    }

    // Attach to scene immediately so the mesh is in the graph when load resolves.
    // This means <primitive> will render it as soon as data is ready.
    meshRef.current = mesh
    scene.add(mesh)

    mesh.load(url)
      .then(() => {
        if (cancelled) return

        // Apply position / rotation / scale from props
        if (position) mesh.position.set(...position)
        if (rotation) mesh.rotation.set(...rotation)
        if (scale !== undefined) {
          if (typeof scale === 'number') {
            mesh.scale.setScalar(scale)
          } else {
            mesh.scale.set(...scale)
          }
        }

        // Build the public API surface
        const box = new Box3().setFromObject(mesh)
        const publicAPI: SplatMeshPublicAPI = {
          splatCount: (mesh as any).data?.count ?? 0,
          boundingBox: box,
          isLoaded: true,
        }
        onLoadRef.current?.(publicAPI)

        // Fire camera hint — parent decides whether to apply it
        const hint: CameraHint = {
          position: mesh.cameraSpawn.clone(),
          target: mesh.cameraTarget.clone(),
          up: new Vector3(0, 1, 0),
        }
        onCameraHintRef.current?.(hint)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const e = err instanceof Error ? err : new Error(String(err))
        console.error('[TSLSplatRenderer] Load error:', e)
        onErrorRef.current?.(e)
      })

    return () => {
      cancelled = true
      scene.remove(mesh)
      mesh.dispose()
      meshRef.current = null
    }
  // gl and scene are stable R3F refs — only re-run when url changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, gl, scene])

  // ── Apply prop changes without reloading ─────────────────────────────────────
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (position) mesh.position.set(...position)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.[0], position?.[1], position?.[2]])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (rotation) mesh.rotation.set(...rotation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation?.[0], rotation?.[1], rotation?.[2]])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || scale === undefined) return
    if (typeof scale === 'number') {
      mesh.scale.setScalar(scale)
    } else {
      mesh.scale.set(...scale)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof scale === 'number' ? scale : scale?.[0], typeof scale === 'number' ? scale : scale?.[1], typeof scale === 'number' ? scale : scale?.[2]])

  // ── Per-frame sort + viewport uniform update ──────────────────────────────────
  useFrame(({ camera: frameCamera }) => {
    meshRef.current?.update(frameCamera)
  })

  // The mesh is added/removed from scene directly in the effect above.
  // We don't use <primitive> here because the mesh is attached imperatively to
  // avoid issues with R3F's reconciler potentially expecting a different Three.js
  // class (due to 'three' vs 'three/webgpu' import ambiguity before alias setup).
  // The component renders nothing into the React tree — all scene graph work is
  // done imperatively in the effect.
  return null
}

// Re-export Euler/Vector3 for convenience — consumers should not need to import
// from 'three' directly just to use these with TSLSplatRenderer props.
export { Vector3, Euler }
