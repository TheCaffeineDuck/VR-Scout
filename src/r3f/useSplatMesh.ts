/**
 * useSplatMesh — Hook for advanced / low-level access to a SplatMesh instance.
 *
 * Prefer `<TSLSplatRenderer>` for typical usage. Use this hook when you need to
 * manage the scene graph yourself, drive the camera from the hint imperatively,
 * or compose the splat with custom render passes.
 *
 * @example
 * ```tsx
 * function MyCustomSplatViewer({ url }: { url: string }) {
 *   const cameraRef = useRef<THREE.PerspectiveCamera>(null)
 *   const { splatMesh, loading, error, cameraHint } = useSplatMesh(url)
 *
 *   useEffect(() => {
 *     if (cameraHint && cameraRef.current) {
 *       cameraRef.current.position.copy(cameraHint.position)
 *     }
 *   }, [cameraHint])
 *
 *   if (error) return null
 *   return splatMesh ? <primitive object={splatMesh} /> : null
 * }
 * ```
 */

import { useEffect, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
// THREE types are imported from 'three' here (not 'three/webgpu') because R3F
// types its `gl` object as WebGLRenderer from 'three'. The actual runtime object
// is a WebGPURenderer — we cast it in setRenderer(). At the Three.js instance
// level they are the same object because the consuming app's bundler must alias
// 'three/webgpu' → the same Three.js source as 'three'. See src/r3f/index.ts
// for the required vite.config.ts alias setup.
import { Vector3 } from 'three'
import { SplatMesh } from '../SplatMesh'
import type { CameraHint } from './types'

export interface UseSplatMeshResult {
  /** The raw SplatMesh instance, or null while loading / on error. */
  splatMesh: SplatMesh | null
  /** True from mount until `load()` resolves (or rejects). */
  loading: boolean
  /** Non-null if `load()` threw. */
  error: Error | null
  /** Download progress (0–100) during LOD background fetch, null otherwise. */
  progress: number | null
  /**
   * Camera placement hint populated after `load()` resolves.
   * Null while loading or on error.
   */
  cameraHint: CameraHint | null
}

/**
 * Create, load, update, and dispose a SplatMesh tied to the R3F render loop.
 *
 * The hook handles:
 * - Calling `setRenderer()` with R3F's `gl` instance before `load()`
 * - Calling `splatMesh.update(camera)` every frame via `useFrame`
 * - Disposing the mesh on unmount or when `url` changes
 * - Exposing `cameraSpawn` / `cameraTarget` as a `CameraHint` after load
 *
 * @param url — URL of the `.splat` or `.ply` file to load.
 */
export function useSplatMesh(url: string): UseSplatMeshResult {
  const { gl, camera } = useThree()

  const [splatMesh, setSplatMesh] = useState<SplatMesh | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [cameraHint, setCameraHint] = useState<CameraHint | null>(null)

  // Keep a ref to the current mesh so useFrame can access it without a stale closure.
  const meshRef = useRef<SplatMesh | null>(null)

  useEffect(() => {
    let cancelled = false

    // Reset state for new URL
    setLoading(true)
    setError(null)
    setProgress(null)
    setCameraHint(null)
    setSplatMesh(null)

    const mesh = new SplatMesh()

    // Cast gl to WebGPURenderer — R3F types it as WebGLRenderer but the runtime
    // object is a WebGPURenderer when the app uses WebGPURenderer at the Canvas level.
    // The bundler deduplication ensures it is the same Three.js instance as SplatMesh's
    // three/webgpu import (see vite alias requirement in src/r3f/index.ts).
    // WebGPURenderer is not in @types/three, so we cast through any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mesh.setRenderer(gl as any)

    mesh.onLoadProgress = (pct: number) => {
      if (!cancelled) setProgress(pct)
    }

    mesh.load(url).then(() => {
      if (cancelled) {
        mesh.dispose()
        return
      }

      meshRef.current = mesh
      setSplatMesh(mesh)
      setLoading(false)
      setProgress(null)

      // Expose camera hint — let the consumer decide what to do with it
      setCameraHint({
        position: mesh.cameraSpawn.clone(),
        target: mesh.cameraTarget.clone(),
        up: new Vector3(0, 1, 0),
      })
    }).catch((err: unknown) => {
      if (cancelled) return
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      setLoading(false)
      mesh.dispose()
    })

    return () => {
      cancelled = true
      meshRef.current = null
      mesh.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Drive sort + viewport uniform every frame
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.update(camera)
    }
  })

  return { splatMesh, loading, error, progress, cameraHint }
}
