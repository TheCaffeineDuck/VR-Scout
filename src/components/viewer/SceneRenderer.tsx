import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { loadScene, disposeScene } from '@/lib/scene-loader'
import { useViewerStore } from '@/stores/viewer-store'

export function SceneRenderer() {
  const groupRef = useRef<THREE.Group>(null)
  const sceneUrl = useViewerStore((s) => s.sceneUrl)
  const setSceneGroup = useViewerStore((s) => s.setSceneGroup)
  const setSceneBounds = useViewerStore((s) => s.setSceneBounds)
  const setLoading = useViewerStore((s) => s.setLoading)
  const setLoadProgress = useViewerStore((s) => s.setLoadProgress)
  const setLoadStage = useViewerStore((s) => s.setLoadStage)
  const setError = useViewerStore((s) => s.setError)
  const { camera } = useThree()

  useEffect(() => {
    if (!sceneUrl) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadProgress(0)
      setLoadStage('Loading scene...')
      setError(null)

      try {
        const scene = await loadScene(sceneUrl!, (progress) => {
          if (!cancelled) setLoadProgress(progress)
        })

        if (cancelled) {
          disposeScene(scene)
          return
        }

        // Compute bounding box
        const box = new THREE.Box3().setFromObject(scene)
        const min = box.min.toArray() as [number, number, number]
        const max = box.max.toArray() as [number, number, number]
        setSceneBounds({ min, max })

        // Center scene and position camera at spawn point
        const center = new THREE.Vector3()
        box.getCenter(center)
        const size = new THREE.Vector3()
        box.getSize(size)

        // Position camera at scene center, eye height 1.6m, backed off by scene size
        const maxDim = Math.max(size.x, size.z)
        camera.position.set(center.x, 1.6, center.z + maxDim * 0.75)
        camera.lookAt(center.x, 1.6, center.z)

        // Clear previous scene
        if (groupRef.current) {
          while (groupRef.current.children.length > 0) {
            const child = groupRef.current.children[0]
            groupRef.current.remove(child)
            if (child instanceof THREE.Group) disposeScene(child)
          }
          groupRef.current.add(scene)
        }

        setSceneGroup(scene)
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

    load()

    return () => {
      cancelled = true
    }
  }, [sceneUrl, camera, setSceneGroup, setSceneBounds, setLoading, setLoadProgress, setLoadStage, setError])

  return <group ref={groupRef} />
}
