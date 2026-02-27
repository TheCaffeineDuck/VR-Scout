import { useState, useEffect, useRef } from 'react'
import { Environment } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewerStore, type EnvironmentPreset } from '@/stores/viewer-store'

const PRESETS: EnvironmentPreset[] = [
  'apartment', 'city', 'dawn', 'forest', 'lobby',
  'night', 'park', 'studio', 'sunset', 'warehouse', 'neutral',
]

/** 3D component that applies environment lighting inside the Canvas */
export function EnvironmentLighting() {
  const preset = useViewerStore((s) => s.environmentPreset)
  const ambientIntensity = useViewerStore((s) => s.ambientIntensity)
  const directionalIntensity = useViewerStore((s) => s.directionalIntensity)
  const fogDistance = useViewerStore((s) => s.fogDistance)
  const showBackground = useViewerStore((s) => s.showBackground)
  const { scene } = useThree()
  const fogRef = useRef<THREE.Fog | null>(null)

  // Set a dark background when no HDRI background is shown.
  // This avoids a transparent/white canvas bleeding through the scene.
  useEffect(() => {
    if (!showBackground || preset === 'neutral') {
      scene.background = new THREE.Color('#0a0a0a')
    } else {
      // When an HDRI preset provides a background, let it handle it
      // (Environment component sets scene.background automatically)
    }
  }, [showBackground, preset, scene])

  // Apply fog — reuse fog instance to avoid per-render allocations
  useEffect(() => {
    if (fogDistance < 200) {
      if (!fogRef.current) {
        fogRef.current = new THREE.Fog('#0a0a0a', 1, fogDistance)
      } else {
        fogRef.current.near = 1
        fogRef.current.far = fogDistance
        fogRef.current.color.set('#0a0a0a')
      }
      scene.fog = fogRef.current
    } else {
      scene.fog = null
    }
  }, [fogDistance, scene])

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight position={[5, 8, 3]} intensity={directionalIntensity} castShadow />
      {preset !== 'neutral' && (
        <Environment
          preset={preset as Exclude<EnvironmentPreset, 'neutral'>}
          background={showBackground}
        />
      )}
    </>
  )
}

/** 2D HTML panel for environment controls */
export function EnvironmentPanel() {
  const [open, setOpen] = useState(false)
  const preset = useViewerStore((s) => s.environmentPreset)
  const ambientIntensity = useViewerStore((s) => s.ambientIntensity)
  const directionalIntensity = useViewerStore((s) => s.directionalIntensity)
  const fogDistance = useViewerStore((s) => s.fogDistance)
  const showBackground = useViewerStore((s) => s.showBackground)
  const showGrid = useViewerStore((s) => s.showGrid)
  const setEnvironmentPreset = useViewerStore((s) => s.setEnvironmentPreset)
  const setAmbientIntensity = useViewerStore((s) => s.setAmbientIntensity)
  const setDirectionalIntensity = useViewerStore((s) => s.setDirectionalIntensity)
  const setFogDistance = useViewerStore((s) => s.setFogDistance)
  const setShowBackground = useViewerStore((s) => s.setShowBackground)
  const setShowGrid = useViewerStore((s) => s.setShowGrid)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-50 bg-gray-800/80 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-sm backdrop-blur-sm"
      >
        Environment
      </button>
    )
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-64 bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 text-white text-sm space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Environment</h3>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">X</button>
      </div>

      <div>
        <label className="block text-gray-400 mb-1">Preset</label>
        <select
          value={preset}
          onChange={(e) => setEnvironmentPreset(e.target.value as EnvironmentPreset)}
          className="w-full bg-gray-800 rounded px-2 py-1"
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-gray-400 mb-1">Ambient: {ambientIntensity.toFixed(1)}</label>
        <input
          type="range" min="0" max="2" step="0.1"
          value={ambientIntensity}
          onChange={(e) => setAmbientIntensity(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-gray-400 mb-1">Directional: {directionalIntensity.toFixed(1)}</label>
        <input
          type="range" min="0" max="3" step="0.1"
          value={directionalIntensity}
          onChange={(e) => setDirectionalIntensity(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-gray-400 mb-1">Fog Distance: {fogDistance}</label>
        <input
          type="range" min="10" max="200" step="10"
          value={fogDistance}
          onChange={(e) => setFogDistance(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox" checked={showBackground}
            onChange={(e) => setShowBackground(e.target.checked)}
          />
          Background
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox" checked={showGrid}
            onChange={(e) => setShowGrid(e.target.checked)}
          />
          Grid
        </label>
      </div>
    </div>
  )
}
