import { useRef, useEffect, useCallback, useState } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useViewerStore } from '@/stores/viewer-store'
import { useToolStore } from '@/stores/tool-store'

/**
 * 2D minimap overlay showing the floor plan with user position.
 * Rendered as an HTML component (outside Canvas), but reads camera
 * position from the R3F scene via a shared ref.
 */

// Shared camera position ref updated by the R3F component
const cameraPos = { x: 0, z: 0, angle: 0 }

/**
 * R3F component that updates the shared camera position ref.
 * Place inside Canvas.
 */
export function FloorPlanTracker() {
  const { camera } = useThree()

  useFrame(() => {
    cameraPos.x = camera.position.x
    cameraPos.z = camera.position.z
    // Get yaw angle from camera direction
    const dir = camera.getWorldDirection(new THREE.Vector3())
    cameraPos.angle = Math.atan2(dir.x, dir.z)
  })

  return null
}

/**
 * HTML minimap overlay component.
 * Rendered outside Canvas in App.tsx.
 */
export function FloorPlanMinimap() {
  const activeTool = useToolStore((s) => s.activeTool)
  const sceneBounds = useViewerStore((s) => s.sceneBounds)
  const [visible, setVisible] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  // For now we don't have a floor plan image, so we draw a simple
  // grid-based minimap from scene bounds
  const mapSize = 160

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !sceneBounds) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { min, max } = sceneBounds
    const sceneW = max[0] - min[0]
    const sceneD = max[2] - min[2]
    const scale = Math.min(mapSize / sceneW, mapSize / sceneD) * 0.85
    const offsetX = mapSize / 2
    const offsetY = mapSize / 2

    // Clear
    ctx.clearRect(0, 0, mapSize, mapSize)

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, mapSize, mapSize)

    // Scene bounds rectangle
    const cx = (min[0] + max[0]) / 2
    const cz = (min[2] + max[2]) / 2
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)'
    ctx.strokeRect(
      offsetX + (min[0] - cx) * scale,
      offsetY + (min[2] - cz) * scale,
      sceneW * scale,
      sceneD * scale,
    )

    // Grid lines
    ctx.strokeStyle = 'rgba(60, 60, 60, 0.3)'
    ctx.lineWidth = 0.5
    const gridStep = 2 // meters
    for (let x = Math.ceil(min[0] / gridStep) * gridStep; x <= max[0]; x += gridStep) {
      const px = offsetX + (x - cx) * scale
      ctx.beginPath()
      ctx.moveTo(px, offsetY + (min[2] - cz) * scale)
      ctx.lineTo(px, offsetY + (max[2] - cz) * scale)
      ctx.stroke()
    }
    for (let z = Math.ceil(min[2] / gridStep) * gridStep; z <= max[2]; z += gridStep) {
      const pz = offsetY + (z - cz) * scale
      ctx.beginPath()
      ctx.moveTo(offsetX + (min[0] - cx) * scale, pz)
      ctx.lineTo(offsetX + (max[0] - cx) * scale, pz)
      ctx.stroke()
    }

    // User position dot
    const userX = offsetX + (cameraPos.x - cx) * scale
    const userZ = offsetY + (cameraPos.z - cz) * scale

    // Direction indicator
    const arrowLen = 8
    ctx.strokeStyle = '#4f46e5'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(userX, userZ)
    ctx.lineTo(
      userX + Math.sin(cameraPos.angle) * arrowLen,
      userZ + Math.cos(cameraPos.angle) * arrowLen,
    )
    ctx.stroke()

    // User dot
    ctx.fillStyle = '#6366f1'
    ctx.beginPath()
    ctx.arc(userX, userZ, 4, 0, Math.PI * 2)
    ctx.fill()

    // North indicator
    ctx.fillStyle = '#ef4444'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', mapSize / 2, 12)

    animRef.current = requestAnimationFrame(draw)
  }, [sceneBounds, mapSize])

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  if (!sceneBounds) return null
  if (activeTool !== 'floorplan' && !visible) return null

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={mapSize}
          height={mapSize}
          className="rounded-lg border border-gray-700 shadow-lg"
        />
        <button
          onClick={() => setVisible(!visible)}
          className="absolute top-1 right-1 text-[9px] text-gray-400 hover:text-white bg-black/50 rounded px-1"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
