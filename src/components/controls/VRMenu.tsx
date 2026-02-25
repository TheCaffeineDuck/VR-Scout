import { useState, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useToolStore } from '@/stores/tool-store'
import type { ToolType } from '@/types/tools'

interface MenuItem {
  tool: ToolType
  label: string
  icon: string
}

const MENU_ITEMS: MenuItem[] = [
  { tool: 'navigate', label: 'Navigate', icon: 'NAV' },
  { tool: 'measure', label: 'Measure', icon: 'MSR' },
  { tool: 'annotate', label: 'Annotate', icon: 'ANN' },
  { tool: 'camera', label: 'Camera', icon: 'CAM' },
  { tool: 'screenshot', label: 'Screenshot', icon: 'SCR' },
  { tool: 'sunpath', label: 'Sun Path', icon: 'SUN' },
  { tool: 'laser', label: 'Laser', icon: 'LSR' },
]

const RADIUS = 0.15
const ITEM_SIZE = 0.04

/**
 * VR radial menu that appears in front of the user when activated.
 * In desktop mode this is hidden - use the toolbar instead.
 * Activated by pressing B button on controller (or Y on left controller).
 */
export function VRMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const { camera } = useThree()
  const activeTool = useToolStore((s) => s.activeTool)
  const setActiveTool = useToolStore((s) => s.setActiveTool)
  const groupRef = useRef<THREE.Group>(null)

  // Listen for menu toggle (keyboard shortcut for testing: M key)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && !e.ctrlKey && !e.altKey) {
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Position menu in front of camera
  useFrame(() => {
    if (!groupRef.current || !isOpen) return
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    groupRef.current.position.copy(camera.position).add(dir.multiplyScalar(0.5))
    groupRef.current.lookAt(camera.position)
  })

  if (!isOpen) return null

  const itemCount = MENU_ITEMS.length

  return (
    <group ref={groupRef}>
      {/* Background disc */}
      <mesh>
        <circleGeometry args={[RADIUS + 0.03, 32]} />
        <meshBasicMaterial color="#111111" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* Menu items arranged in a circle */}
      {MENU_ITEMS.map((item, i) => {
        const angle = (i / itemCount) * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(angle) * RADIUS
        const y = Math.sin(angle) * RADIUS
        const isActive = activeTool === item.tool

        return (
          <group
            key={item.tool}
            position={[x, y, 0.001]}
            onClick={() => {
              setActiveTool(item.tool)
              setIsOpen(false)
            }}
          >
            {/* Item background */}
            <mesh>
              <circleGeometry args={[ITEM_SIZE, 16]} />
              <meshBasicMaterial
                color={isActive ? '#4f46e5' : '#374151'}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Label */}
            <Text
              position={[0, 0, 0.001]}
              fontSize={0.018}
              color="white"
              anchorX="center"
              anchorY="middle"
            >
              {item.icon}
            </Text>

            {/* Tool name below */}
            <Text
              position={[0, -ITEM_SIZE - 0.01, 0.001]}
              fontSize={0.012}
              color="#9ca3af"
              anchorX="center"
              anchorY="top"
            >
              {item.label}
            </Text>
          </group>
        )
      })}

      {/* Center label */}
      <Text
        position={[0, 0, 0.002]}
        fontSize={0.015}
        color="#6b7280"
        anchorX="center"
        anchorY="middle"
      >
        Tools
      </Text>
    </group>
  )
}
