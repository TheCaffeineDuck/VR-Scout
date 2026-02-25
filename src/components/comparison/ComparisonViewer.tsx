import { useState, useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { createRenderer } from '@/lib/renderer'
import { loadScene, disposeScene } from '@/lib/scene-loader'
import { buildSceneBVH, disposeSceneBVH } from '@/lib/raycaster'
import { useViewerStore, type EnvironmentPreset } from '@/stores/viewer-store'
import { CINEMA_LENSES } from '@/types/camera'

interface ComparisonSide {
  sceneUrl: string | null
  sceneName: string
}

/**
 * Split-screen comparison viewer showing two scenes side by side.
 * Each side has independent orbit controls.
 */
export function ComparisonViewer({
  onClose,
}: {
  onClose: () => void
}) {
  const [left, setLeft] = useState<ComparisonSide>({ sceneUrl: null, sceneName: '' })
  const [right, setRight] = useState<ComparisonSide>({ sceneUrl: null, sceneName: '' })
  const [syncRotation, setSyncRotation] = useState(false)
  const [leftLens, setLeftLens] = useState(2) // 35mm
  const [rightLens, setRightLens] = useState(2)
  const preset = useViewerStore((s) => s.environmentPreset)

  // Available scenes (same as SceneSelector)
  const scenes = [
    { name: 'Room (Preview)', url: '/scenes/room_preview.glb' },
    { name: 'Room (Medium)', url: '/scenes/room_medium.glb' },
    { name: 'Room (High)', url: '/scenes/room_high.glb' },
    { name: 'Garden (Preview)', url: '/scenes/garden_preview.glb' },
    { name: 'Garden (Medium)', url: '/scenes/garden_medium.glb' },
    { name: 'Garden (High)', url: '/scenes/garden_high.glb' },
  ]

  const swap = () => {
    const tmp = left
    setLeft(right)
    setRight(tmp)
    const tmpLens = leftLens
    setLeftLens(rightLens)
    setRightLens(tmpLens)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <h2 className="text-white text-sm font-medium">Comparison View</h2>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={syncRotation}
              onChange={(e) => setSyncRotation(e.target.checked)}
              className="rounded"
            />
            Sync rotation
          </label>
          <button
            onClick={swap}
            className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
          >
            Swap
          </button>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded bg-red-600/80 text-white hover:bg-red-500"
          >
            Close
          </button>
        </div>
      </div>

      {/* Side-by-side canvases */}
      <div className="flex flex-1 min-h-0">
        <ComparisonPane
          side="left"
          scene={left}
          scenes={scenes}
          onSelectScene={(url, name) => setLeft({ sceneUrl: url, sceneName: name })}
          lensIndex={leftLens}
          onLensChange={setLeftLens}
          envPreset={preset}
        />
        <div className="w-px bg-gray-700" />
        <ComparisonPane
          side="right"
          scene={right}
          scenes={scenes}
          onSelectScene={(url, name) => setRight({ sceneUrl: url, sceneName: name })}
          lensIndex={rightLens}
          onLensChange={setRightLens}
          envPreset={preset}
        />
      </div>
    </div>
  )
}

function ComparisonPane({
  side,
  scene,
  scenes,
  onSelectScene,
  lensIndex,
  onLensChange,
  envPreset,
}: {
  side: 'left' | 'right'
  scene: ComparisonSide
  scenes: { name: string; url: string }[]
  onSelectScene: (url: string, name: string) => void
  lensIndex: number
  onLensChange: (i: number) => void
  envPreset: EnvironmentPreset
}) {
  const lens = CINEMA_LENSES[lensIndex]

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Scene selector bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/80">
        <select
          value={scene.sceneUrl || ''}
          onChange={(e) => {
            const s = scenes.find((s) => s.url === e.target.value)
            if (s) onSelectScene(s.url, s.name)
          }}
          className="flex-1 bg-gray-800 text-white text-xs rounded px-2 py-1 outline-none"
        >
          <option value="">Select scene...</option>
          {scenes.map((s) => (
            <option key={s.url} value={s.url}>{s.name}</option>
          ))}
        </select>
        <select
          value={lensIndex}
          onChange={(e) => onLensChange(parseInt(e.target.value))}
          className="bg-gray-800 text-white text-xs rounded px-2 py-1 outline-none"
        >
          {CINEMA_LENSES.map((l, i) => (
            <option key={l.focalLength} value={i}>{l.focalLength}mm</option>
          ))}
        </select>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        {scene.sceneUrl ? (
          <Canvas
            gl={(props) => createRenderer(props)}
            camera={{ position: [0, 1.6, 5], fov: lens.fov, near: 0.1, far: 1000 }}
          >
            <ComparisonScene url={scene.sceneUrl} fov={lens.fov} envPreset={envPreset} />
          </Canvas>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
            Select a scene
          </div>
        )}
      </div>
    </div>
  )
}

function ComparisonScene({
  url,
  fov,
  envPreset,
}: {
  url: string
  fov: number
  envPreset: EnvironmentPreset
}) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  // Update FOV when lens changes
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }, [fov, camera])

  // Load scene
  useEffect(() => {
    let cancelled = false
    let loaded: THREE.Group | null = null

    loadScene(url).then((scene) => {
      if (cancelled) { disposeScene(scene); return }
      loaded = scene
      buildSceneBVH(scene)

      if (groupRef.current) {
        // Clear previous
        while (groupRef.current.children.length > 0) {
          const child = groupRef.current.children[0]
          groupRef.current.remove(child)
        }
        groupRef.current.add(scene)

        // Position camera
        const box = new THREE.Box3().setFromObject(scene)
        const center = new THREE.Vector3()
        box.getCenter(center)
        const size = new THREE.Vector3()
        box.getSize(size)
        const maxDim = Math.max(size.x, size.z)
        camera.position.set(center.x, 1.6, center.z + maxDim * 0.75)
        camera.lookAt(center)
      }
    })

    return () => {
      cancelled = true
      if (loaded) {
        disposeSceneBVH(loaded)
        disposeScene(loaded)
      }
    }
  }, [url, camera])

  return (
    <>
      {envPreset !== 'neutral' && (
        <Environment preset={envPreset as Exclude<typeof envPreset, 'neutral'>} background={false} />
      )}
      <ambientLight intensity={0.5} />
      <group ref={groupRef} />
      <OrbitControls makeDefault />
    </>
  )
}
