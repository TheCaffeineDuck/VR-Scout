import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useToolStore } from '@/stores/tool-store'
import { useSunPath, colorTempToRGB } from '@/hooks/useSunPath'

const SUN_DISTANCE = 50

/**
 * 3D sun indicator and directional light that tracks the sun position.
 * Renders inside Canvas.
 */
export function SunPathLight() {
  const activeTool = useToolStore((s) => s.activeTool)
  const sunData = useSunPath()
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const sunRef = useRef<THREE.Mesh>(null)

  const rgb = useMemo(() => colorTempToRGB(sunData.colorTemp), [sunData.colorTemp])
  const sunColor = useMemo(() => new THREE.Color(...rgb), [rgb])

  // Update light direction every frame
  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.position.set(
        sunData.direction[0] * SUN_DISTANCE,
        sunData.direction[1] * SUN_DISTANCE,
        sunData.direction[2] * SUN_DISTANCE,
      )
      lightRef.current.color.copy(sunColor)
    }
    if (sunRef.current) {
      sunRef.current.position.set(
        sunData.direction[0] * SUN_DISTANCE,
        sunData.direction[1] * SUN_DISTANCE,
        sunData.direction[2] * SUN_DISTANCE,
      )
    }
  })

  // Only show sun indicator when sunpath tool is active
  const showIndicator = activeTool === 'sunpath'

  return (
    <group>
      {/* Directional light always tracks sun (even when tool not active) */}
      <directionalLight
        ref={lightRef}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      {/* Sun indicator sphere */}
      {showIndicator && (
        <mesh ref={sunRef}>
          <sphereGeometry args={[1.5, 16, 16]} />
          <meshBasicMaterial color={sunColor} />
        </mesh>
      )}

      {/* Compass overlay when sunpath tool is active */}
      {showIndicator && <CompassOverlay />}
    </group>
  )
}

function CompassOverlay() {
  return (
    <Html position={[0, 0.5, -5]} center distanceFactor={10}>
      <div className="text-white/50 text-xs select-none pointer-events-none">
        <div className="flex gap-8">
          <span>N</span>
          <span>E</span>
          <span>S</span>
          <span>W</span>
        </div>
      </div>
    </Html>
  )
}

/**
 * HTML control panel for the sun-path simulator.
 * Rendered outside Canvas.
 */
export function SunPathPanel() {
  const activeTool = useToolStore((s) => s.activeTool)
  const sunTime = useToolStore((s) => s.sunTime)
  const sunDate = useToolStore((s) => s.sunDate)
  const setSunTime = useToolStore((s) => s.setSunTime)
  const setSunDate = useToolStore((s) => s.setSunDate)
  const sunData = useSunPath()

  if (activeTool !== 'sunpath') return null

  const altDeg = ((sunData.altitude * 180) / Math.PI).toFixed(1)

  return (
    <div className="fixed left-4 bottom-20 z-50 bg-gray-900/95 rounded-xl p-3 shadow-xl w-64">
      <h3 className="text-xs font-semibold text-white mb-2">Sun Path</h3>

      {/* Time slider */}
      <div className="mb-2">
        <label className="text-[10px] text-gray-400 flex justify-between">
          <span>Time of Day</span>
          <span>{Math.round(sunTime * 100)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={sunTime}
          onChange={(e) => setSunTime(parseFloat(e.target.value))}
          className="w-full h-1 mt-1"
        />
        <div className="flex justify-between text-[9px] text-gray-500">
          <span>Sunrise</span>
          <span>Sunset</span>
        </div>
      </div>

      {/* Date picker */}
      <div className="mb-2">
        <label className="text-[10px] text-gray-400 block mb-0.5">Date</label>
        <input
          type="date"
          value={sunDate.toISOString().split('T')[0]}
          onChange={(e) => setSunDate(new Date(e.target.value + 'T12:00:00'))}
          className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1 outline-none"
        />
      </div>

      {/* Quick jump buttons */}
      <div className="flex gap-1.5 mb-2">
        <button
          onClick={() => setSunTime(0.1)}
          className="flex-1 text-[10px] py-1 rounded bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
        >
          Morning Golden
        </button>
        <button
          onClick={() => setSunTime(0.5)}
          className="flex-1 text-[10px] py-1 rounded bg-sky-600/20 text-sky-400 hover:bg-sky-600/30"
        >
          Noon
        </button>
        <button
          onClick={() => setSunTime(0.9)}
          className="flex-1 text-[10px] py-1 rounded bg-orange-600/20 text-orange-400 hover:bg-orange-600/30"
        >
          Evening Golden
        </button>
      </div>

      {/* Info */}
      <div className="text-[10px] text-gray-500 flex gap-3">
        <span>Alt: {altDeg}</span>
        <span>{sunData.colorTemp}K</span>
        {sunData.isGoldenHour && (
          <span className="text-amber-400">Golden Hour</span>
        )}
      </div>
    </div>
  )
}
