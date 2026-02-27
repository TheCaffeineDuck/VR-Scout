import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { loadSplatScene, disposeScene } from '@/lib/scene-loader'
import { useViewerStore } from '@/stores/viewer-store'
import type { SceneLOD } from '@/types/scene'
import type { LODLevel } from '@/stores/viewer-store'

/**
 * Scene loading hook for Spark Gaussian Splat scenes.
 *
 * Spark scenes (.spz) are pre-oriented and pre-scaled by the capture
 * pipeline — no PCA auto-level, outlier culling, or geometry merging
 * needed. The hook loads the splat scene, computes bounds, positions
 * the camera, and swaps it into the R3F scene graph.
 *
 * Progressive LOD loading: loads preview first for fast first paint,
 * then swaps in high quality in the background.
 */
export function useScene(groupRef: React.RefObject<THREE.Group | null>) {
  const sceneUrl = useViewerStore((s) => s.sceneUrl)
  const sceneLOD = useViewerStore((s) => s.sceneLOD)
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
      // Compute bounds from loaded splat
      const box = new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3()
      box.getSize(size)
      const center = new THREE.Vector3()
      box.getCenter(center)

      const min = box.min.toArray() as [number, number, number]
      const max = box.max.toArray() as [number, number, number]
      setSceneBounds({ min, max })

      if (positionCamera) {
        // Place camera at standing eye height (1.7m above floor)
        const eyeY = Math.max(box.min.y + 1.7, center.y)
        camera.position.set(center.x, eyeY, center.z)
        camera.lookAt(center.x, eyeY, center.z - 1)

        // Far plane from bounding box diagonal
        const diagonal = size.length()
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.far = diagonal * 2
          camera.near = Math.max(0.05, diagonal * 0.001)
          camera.updateProjectionMatrix()
        }

        console.log(
          `[placeScene] Camera at (${center.x.toFixed(1)}, ${eyeY.toFixed(1)}, ${center.z.toFixed(1)}), ` +
          `size=(${size.x.toFixed(1)}, ${size.y.toFixed(1)}, ${size.z.toFixed(1)}), ` +
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
    [camera, groupRef, setSceneBounds, setSceneGroup],
  )

  // Progressive LOD loading (SceneLOD object with preview/medium/high URLs)
  useEffect(() => {
    if (!sceneLOD) return

    let cancelled = false

    async function loadProgressive(lod: SceneLOD) {
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
          })
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
      if (highUrl && !cancelled) {
        try {
          setLoadStage('Loading high quality...')
          const highScene = await loadSplatScene(highUrl, (p) => {
            if (!cancelled) setLoadProgress(0.3 + p * 0.7) // 30-100%
          })
          if (cancelled) {
            disposeScene(highScene)
            return
          }
          placeScene(highScene, false)
          setCurrentLOD('high')
          setLoadStage('High quality loaded')
        } catch (err) {
          if (cancelled) return
          console.warn('High quality LOD failed:', err)
        }
      }

      if (!cancelled) {
        setLoading(false)
        setLoadStage('Complete')
        setLoadProgress(1)
      }
    }

    loadProgressive(sceneLOD)

    return () => {
      cancelled = true
    }
  }, [sceneLOD, placeScene, setCurrentLOD, setLoading, setLoadProgress, setLoadStage, setError])

  // Single URL loading (backwards compatible)
  useEffect(() => {
    if (!sceneUrl || sceneLOD) return

    let cancelled = false

    async function loadSingle() {
      setLoading(true)
      setLoadProgress(0)
      setLoadStage('Loading scene...')
      setError(null)

      try {
        const scene = await loadSplatScene(sceneUrl!, (progress) => {
          if (!cancelled) setLoadProgress(progress)
        })

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
  }, [sceneUrl, sceneLOD, placeScene, setCurrentLOD, setLoading, setLoadProgress, setLoadStage, setError])

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
