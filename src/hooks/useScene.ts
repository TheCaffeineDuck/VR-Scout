import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { loadSplatScene, disposeScene, type LoadSplatOptions } from '@/lib/scene-loader'
import { useViewerStore } from '@/stores/viewer-store'
import type { SceneLOD } from '@/types/scene'
import type { LODLevel } from '@/stores/viewer-store'

/**
 * Scene loading hook for Spark Gaussian Splat scenes.
 *
 * SPZ data is stored in raw OpenCV coordinates. The scene-loader applies
 * a 180° X rotation on the SplatMesh (OpenCV→OpenGL) and provides
 * world-space bounding boxes. This hook positions the camera at the
 * world-space origin (COLMAP reconstruction center) and swaps scenes
 * into the R3F scene graph.
 *
 * Progressive LOD loading: loads preview first for fast first paint,
 * then swaps in high quality in the background.
 */
export function useScene(groupRef: React.RefObject<THREE.Group | null>) {
  const sceneUrl = useViewerStore((s) => s.sceneUrl)
  const sceneLOD = useViewerStore((s) => s.sceneLOD)
  const splatCoordinateSystem = useViewerStore((s) => s.splatCoordinateSystem)
  const splatSceneRotation = useViewerStore((s) => s.splatSceneRotation)
  const spawnPoint = useViewerStore((s) => s.spawnPoint)
  const setSceneGroup = useViewerStore((s) => s.setSceneGroup)
  const setSceneBounds = useViewerStore((s) => s.setSceneBounds)
  const setCurrentLOD = useViewerStore((s) => s.setCurrentLOD)
  const setLoading = useViewerStore((s) => s.setLoading)
  const setLoadProgress = useViewerStore((s) => s.setLoadProgress)
  const setLoadStage = useViewerStore((s) => s.setLoadStage)
  const setError = useViewerStore((s) => s.setError)
  const { camera } = useThree()

  const currentSceneRef = useRef<THREE.Group | null>(null)

  const placeScene = useCallback(
    (scene: THREE.Group, positionCamera: boolean) => {
      // Use pre-computed world-space splat bounds (Box3.setFromObject doesn't
      // work for SplatMesh because positions are in GPU textures)
      const box = (scene.userData.splatBounds as THREE.Box3) ??
        new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3()
      box.getSize(size)
      const center = new THREE.Vector3()
      box.getCenter(center)

      const min = box.min.toArray() as [number, number, number]
      const max = box.max.toArray() as [number, number, number]
      setSceneBounds({ min, max })

      if (positionCamera) {
        const [sx, sy, sz] = spawnPoint.position
        const hasExplicitSpawn = sx !== 0 || sy !== 0 || sz !== 0

        if (hasExplicitSpawn) {
          camera.position.set(sx, sy, sz)
          // Look toward -Z (Three.js forward direction) from spawn position
          camera.lookAt(sx, sy, sz - 1)
        } else {
          // Auto-compute spawn from world-space bounds:
          // Stand at the horizontal center, 1.6m above the floor (bbox min Y).
          // Offset floor slightly inward (5% of height) to avoid outlier splats.
          const floorY = box.min.y + size.y * 0.05
          camera.position.set(center.x, floorY + 1.6, center.z)
          // Look toward scene center (slightly up from floor)
          camera.lookAt(center.x, center.y, center.z)
        }

        // Far plane from bounding box diagonal
        const diagonal = size.length()
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.far = diagonal * 2
          camera.near = Math.max(0.05, diagonal * 0.001)
          camera.updateProjectionMatrix()
        }

        const p = camera.position
        console.log(
          `[placeScene] Camera at ${hasExplicitSpawn ? 'spawn' : 'auto'} ` +
          `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}), ` +
          `bounds=(${size.x.toFixed(1)}, ${size.y.toFixed(1)}, ${size.z.toFixed(1)}), ` +
          `far=${(diagonal * 2).toFixed(0)}`,
        )
      }

      // Swap into scene graph
      if (groupRef.current) {
        while (groupRef.current.children.length > 0) {
          const child = groupRef.current.children[0]
          groupRef.current.remove(child)
          if (child instanceof THREE.Group) {
            disposeScene(child)
          }
        }
        groupRef.current.add(scene)
      }

      // Dispose previous scene ref
      if (currentSceneRef.current && currentSceneRef.current !== scene) {
        disposeScene(currentSceneRef.current)
      }
      currentSceneRef.current = scene

      setSceneGroup(scene)
    },
    [camera, groupRef, setSceneBounds, setSceneGroup, spawnPoint],
  )

  // Progressive LOD loading (SceneLOD object with preview/medium/high URLs)
  useEffect(() => {
    if (!sceneLOD) return

    let cancelled = false

    const loadOpts: LoadSplatOptions = {
      coordinateSystem: splatCoordinateSystem,
      sceneRotation: splatSceneRotation ?? undefined,
    }

    async function loadProgressive(lod: SceneLOD) {
      const t0 = performance.now()
      setLoading(true)
      setLoadProgress(0)
      setError(null)

      // Step 1: Load preview LOD for instant display
      const previewUrl = lod.preview
      if (previewUrl) {
        try {
          setLoadStage('Loading preview...')
          const preview = await loadSplatScene(previewUrl, (p) => {
            if (!cancelled) setLoadProgress(p * 0.3) // 0-30%
          }, loadOpts)
          if (cancelled) {
            disposeScene(preview)
            return
          }
          placeScene(preview, true)
          setCurrentLOD('preview')
          setLoadStage('Preview loaded')
        } catch (err) {
          if (cancelled) return
          console.warn('Preview LOD failed, loading high quality directly:', err)
        }
      }

      // Step 2: Load high-quality LOD in background
      const highUrl = lod.high
      const hasPreview = !!previewUrl
      if (highUrl && !cancelled) {
        try {
          setLoadStage(hasPreview ? 'Loading high quality...' : 'Loading scene...')
          const highScene = await loadSplatScene(highUrl, (p) => {
            if (!cancelled) {
              // Full 0-100% range when no preview, otherwise 30-100%
              setLoadProgress(hasPreview ? 0.3 + p * 0.7 : p)
            }
          }, loadOpts)
          if (cancelled) {
            disposeScene(highScene)
            return
          }
          placeScene(highScene, !hasPreview)
          setCurrentLOD('high')
          setLoadStage('High quality loaded')
        } catch (err) {
          if (cancelled) return
          console.warn('High quality LOD failed:', err)
        }
      }

      if (!cancelled) {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(2)
        console.log(`[useScene] Total load time: ${elapsed}s`)
        setLoading(false)
        setLoadStage('Complete')
        setLoadProgress(1)
      }
    }

    loadProgressive(sceneLOD)

    return () => {
      cancelled = true
    }
  }, [sceneLOD, splatCoordinateSystem, splatSceneRotation, placeScene, setCurrentLOD, setLoading, setLoadProgress, setLoadStage, setError])

  // Single URL loading (backwards compatible)
  useEffect(() => {
    if (!sceneUrl || sceneLOD) return

    let cancelled = false

    const loadOpts: LoadSplatOptions = {
      coordinateSystem: splatCoordinateSystem,
      sceneRotation: splatSceneRotation ?? undefined,
    }

    async function loadSingle() {
      setLoading(true)
      setLoadProgress(0)
      setLoadStage('Loading scene...')
      setError(null)

      try {
        const scene = await loadSplatScene(sceneUrl!, (progress) => {
          if (!cancelled) setLoadProgress(progress)
        }, loadOpts)

        if (cancelled) {
          disposeScene(scene)
          return
        }

        placeScene(scene, true)
        setCurrentLOD('high')
        setLoadStage('Complete')
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load scene'
          setError(message)
          setLoading(false)
        }
      }
    }

    loadSingle()

    return () => {
      cancelled = true
    }
  }, [sceneUrl, sceneLOD, splatCoordinateSystem, splatSceneRotation, placeScene, setCurrentLOD, setLoading, setLoadProgress, setLoadStage, setError])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const scene = currentSceneRef.current
      if (scene) {
        disposeScene(scene)
        currentSceneRef.current = null
      }
      setSceneGroup(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
