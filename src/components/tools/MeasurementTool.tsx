import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { useToolStore } from '@/stores/tool-store'
import { useViewerStore } from '@/stores/viewer-store'
import { useMeasurementStore, type MeasurementLine } from '@/hooks/useMeasurement'
import { raycastNearest } from '@/lib/raycaster'

const MARKER_RADIUS = 0.04

function Marker({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[MARKER_RADIUS, 12, 12]} />
      <meshBasicMaterial color="#ff4444" />
    </mesh>
  )
}

function CompletedMeasurement({
  line,
  unit,
  onRemove,
}: {
  line: MeasurementLine
  unit: 'meters' | 'feet'
  onRemove: () => void
}) {
  const mid: [number, number, number] = [
    (line.start[0] + line.end[0]) / 2,
    (line.start[1] + line.end[1]) / 2,
    (line.start[2] + line.end[2]) / 2,
  ]
  const d = unit === 'feet' ? line.distance * 3.28084 : line.distance
  const label = `${d.toFixed(2)} ${unit === 'feet' ? 'ft' : 'm'}`

  return (
    <group>
      <Line points={[line.start, line.end]} color="#ff4444" lineWidth={2} />
      <Marker position={line.start} />
      <Marker position={line.end} />
      <Html position={mid} center distanceFactor={8} zIndexRange={[50, 0]}>
        <div className="bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap select-none pointer-events-auto flex items-center gap-1.5">
          <span>{label}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="text-red-400 hover:text-red-300 font-bold leading-none"
          >
            x
          </button>
        </div>
      </Html>
    </group>
  )
}

/**
 * Shows a dashed line from pendingStart to the current mouse hit point,
 * updated every frame.
 */
function PendingMeasurement({
  start,
  unit,
}: {
  start: [number, number, number]
  unit: 'meters' | 'feet'
}) {
  const sceneGroup = useViewerStore((s) => s.sceneGroup)
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])

  const lineGeomRef = useRef<THREE.BufferGeometry>(null)
  const labelGroupRef = useRef<THREE.Group>(null)
  const labelDivRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })

  // Track mouse position
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    gl.domElement.addEventListener('mousemove', onMove)
    return () => gl.domElement.removeEventListener('mousemove', onMove)
  }, [gl])

  useFrame(() => {
    if (!sceneGroup) return
    ndc.set(mouseRef.current.x, mouseRef.current.y)
    raycaster.setFromCamera(ndc, camera)
    raycaster.firstHitOnly = true
    const hits = raycaster.intersectObject(sceneGroup, true)
    raycaster.firstHitOnly = false
    if (hits.length === 0) return

    const end = hits[0].point

    // Update line
    if (lineGeomRef.current) {
      const pos = lineGeomRef.current.getAttribute('position')
      if (pos) {
        pos.setXYZ(0, start[0], start[1], start[2])
        pos.setXYZ(1, end.x, end.y, end.z)
        pos.needsUpdate = true
      }
    }

    // Update label position & text
    const mx = (start[0] + end.x) / 2
    const my = (start[1] + end.y) / 2
    const mz = (start[2] + end.z) / 2
    if (labelGroupRef.current) {
      labelGroupRef.current.position.set(mx, my, mz)
    }
    if (labelDivRef.current) {
      const dist = Math.sqrt(
        (end.x - start[0]) ** 2 + (end.y - start[1]) ** 2 + (end.z - start[2]) ** 2,
      )
      const d = unit === 'feet' ? dist * 3.28084 : dist
      labelDivRef.current.textContent = `${d.toFixed(2)} ${unit === 'feet' ? 'ft' : 'm'}`
    }
  })

  return (
    <group>
      <Marker position={start} />
      <line>
        <bufferGeometry ref={lineGeomRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([...start, ...start]), 3]}
            count={2}
          />
        </bufferGeometry>
        <lineDashedMaterial color="#ffaa00" dashSize={0.1} gapSize={0.05} />
      </line>
      <group ref={labelGroupRef}>
        <Html center distanceFactor={8} zIndexRange={[50, 0]}>
          <div
            ref={labelDivRef}
            className="bg-black/60 text-yellow-300 text-xs px-2 py-0.5 rounded whitespace-nowrap select-none"
          >
            0.00 m
          </div>
        </Html>
      </group>
    </group>
  )
}

export function MeasurementTool() {
  const activeTool = useToolStore((s) => s.activeTool)
  const unit = useToolStore((s) => s.measurementUnit)
  const sceneGroup = useViewerStore((s) => s.sceneGroup)
  const measurements = useMeasurementStore((s) => s.measurements)
  const pendingStart = useMeasurementStore((s) => s.pendingStart)
  const removeMeasurement = useMeasurementStore((s) => s.removeMeasurement)
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  // Attach click handler to canvas when measure tool is active
  useEffect(() => {
    if (activeTool !== 'measure') return

    gl.domElement.style.cursor = 'crosshair'

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || !sceneGroup) return

      const rect = gl.domElement.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
      const hit = raycastNearest(raycaster, sceneGroup)
      if (!hit) return

      const point = hit.point.toArray() as [number, number, number]
      const current = useMeasurementStore.getState().pendingStart

      if (!current) {
        useMeasurementStore.getState().setPendingStart(point)
      } else {
        const dist = new THREE.Vector3(...current).distanceTo(hit.point)
        useMeasurementStore.getState().addMeasurement({
          id: crypto.randomUUID(),
          start: current,
          end: point,
          distance: dist,
        })
        useMeasurementStore.getState().setPendingStart(null)
      }
    }

    const onContextMenu = (e: MouseEvent) => {
      // Right-click cancels pending measurement
      if (useMeasurementStore.getState().pendingStart) {
        e.preventDefault()
        useMeasurementStore.getState().setPendingStart(null)
      }
    }

    gl.domElement.addEventListener('click', onClick)
    gl.domElement.addEventListener('contextmenu', onContextMenu)

    return () => {
      gl.domElement.style.cursor = ''
      gl.domElement.removeEventListener('click', onClick)
      gl.domElement.removeEventListener('contextmenu', onContextMenu)
    }
  }, [activeTool, sceneGroup, camera, gl, raycaster])

  return (
    <group>
      {/* Completed measurements — always visible regardless of active tool */}
      {measurements.map((m) => (
        <CompletedMeasurement
          key={m.id}
          line={m}
          unit={unit}
          onRemove={() => removeMeasurement(m.id)}
        />
      ))}

      {/* Pending line while placing second point */}
      {pendingStart && activeTool === 'measure' && (
        <PendingMeasurement start={pendingStart} unit={unit} />
      )}
    </group>
  )
}
