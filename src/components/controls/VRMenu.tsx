import { useState, useRef, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useToolStore } from '@/stores/tool-store'
import { useSessionStore } from '@/stores/session-store'
import { useCollaboration } from '@/hooks/useCollaboration'
import type { ToolType } from '@/types/tools'

interface MenuItem {
  tool: ToolType
  label: string
  icon: string
}

const TOOL_ITEMS: MenuItem[] = [
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

// Valid characters for VR code input (no ambiguous)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'.split('')

type MenuMode = 'tools' | 'session' | 'vr-code-input'

/**
 * VR radial menu that appears in front of the user when activated.
 * In desktop mode this is hidden - use the toolbar instead.
 * Activated by pressing M key (or B/Y on controller).
 */
export function VRMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<MenuMode>('tools')
  const [codeInput, setCodeInput] = useState('')
  const { camera } = useThree()
  const activeTool = useToolStore((s) => s.activeTool)
  const setActiveTool = useToolStore((s) => s.setActiveTool)
  const groupRef = useRef<THREE.Group>(null)

  const currentSession = useSessionStore((s) => s.currentSession)
  const isCollaborative = useSessionStore((s) => s.isCollaborative)
  const connectionStatus = useSessionStore((s) => s.connectionStatus)
  const participants = useSessionStore((s) => s.participants)
  const { leaveSession, localUid } = useCollaboration()

  const isInSession = isCollaborative && connectionStatus === 'connected'
  const isHost = currentSession?.hostUid === localUid

  // Listen for menu toggle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && !e.ctrlKey && !e.altKey) {
        setIsOpen((prev) => {
          if (prev) {
            // Reset mode when closing
            setMode('tools')
            setCodeInput('')
          }
          return !prev
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const menuDir = useRef(new THREE.Vector3())

  // Position menu in front of camera
  useFrame(() => {
    if (!groupRef.current || !isOpen) return
    camera.getWorldDirection(menuDir.current)
    groupRef.current.position
      .copy(camera.position)
      .add(menuDir.current.multiplyScalar(0.5))
    groupRef.current.lookAt(camera.position)
  })

  const handleCreateSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent('vr-create-session'))
    setIsOpen(false)
    setMode('tools')
  }, [])

  const handleLeaveSession = useCallback(() => {
    leaveSession()
    setIsOpen(false)
    setMode('tools')
  }, [leaveSession])

  const handleEndSession = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('vr-end-session'),
    )
    leaveSession()
    setIsOpen(false)
    setMode('tools')
  }, [leaveSession])

  const handleCodeChar = useCallback(
    (char: string) => {
      if (codeInput.length >= 6) return
      const next = codeInput + char
      setCodeInput(next)
      if (next.length === 6) {
        // Auto-submit
        window.dispatchEvent(
          new CustomEvent('vr-join-session-code', { detail: { code: next } }),
        )
        setIsOpen(false)
        setMode('tools')
        setCodeInput('')
      }
    },
    [codeInput],
  )

  if (!isOpen) return null

  return (
    <group ref={groupRef}>
      {/* Background disc */}
      <mesh>
        <circleGeometry
          args={[
            mode === 'vr-code-input' ? 0.25 : RADIUS + 0.03,
            32,
          ]}
        />
        <meshBasicMaterial
          color="#111111"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      {mode === 'tools' && <ToolsView />}
      {mode === 'session' && <SessionView />}
      {mode === 'vr-code-input' && <CodeInputView />}
    </group>
  )

  function ToolsView() {
    const allItems = [
      ...TOOL_ITEMS,
      { tool: 'session' as ToolType, label: 'Session', icon: 'SES' },
    ]
    const itemCount = allItems.length

    return (
      <>
        {allItems.map((item, i) => {
          const angle = (i / itemCount) * Math.PI * 2 - Math.PI / 2
          const x = Math.cos(angle) * RADIUS
          const y = Math.sin(angle) * RADIUS
          const isActive =
            item.tool !== ('session' as ToolType) && activeTool === item.tool
          const isSessionItem = item.tool === ('session' as ToolType)

          return (
            <group
              key={item.tool}
              position={[x, y, 0.001]}
              onClick={() => {
                if (isSessionItem) {
                  setMode('session')
                } else {
                  setActiveTool(item.tool)
                  setIsOpen(false)
                }
              }}
            >
              <mesh>
                <circleGeometry args={[ITEM_SIZE, 16]} />
                <meshBasicMaterial
                  color={
                    isActive
                      ? '#4f46e5'
                      : isSessionItem && isInSession
                        ? '#059669'
                        : '#374151'
                  }
                  side={THREE.DoubleSide}
                />
              </mesh>
              <Text
                position={[0, 0, 0.001]}
                fontSize={0.018}
                color="white"
                anchorX="center"
                anchorY="middle"
              >
                {item.icon}
              </Text>
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
      </>
    )
  }

  function SessionView() {
    if (isInSession) {
      // In-session view: show code, participants, leave/end
      const code = currentSession?.accessCode ?? ''
      return (
        <>
          {/* Title */}
          <Text
            position={[0, 0.12, 0.001]}
            fontSize={0.016}
            color="white"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            Session Active
          </Text>

          {/* Access code */}
          {code && (
            <Text
              position={[0, 0.08, 0.001]}
              fontSize={0.025}
              color="#a5b4fc"
              anchorX="center"
              anchorY="middle"
              font={undefined}
            >
              {code.split('').join(' ')}
            </Text>
          )}

          {/* Participants */}
          <Text
            position={[0, 0.04, 0.001]}
            fontSize={0.013}
            color="#9ca3af"
            anchorX="center"
            anchorY="middle"
          >
            {`${participants.length} participant${participants.length !== 1 ? 's' : ''}`}
          </Text>

          {/* Participant names */}
          {participants.slice(0, 4).map((p, i) => (
            <Text
              key={p.uid}
              position={[0, 0.01 - i * 0.025, 0.001]}
              fontSize={0.011}
              color="#d1d5db"
              anchorX="center"
              anchorY="middle"
            >
              {p.displayName}
            </Text>
          ))}

          {/* Leave button */}
          <group
            position={[-0.06, -0.1, 0.001]}
            onClick={handleLeaveSession}
          >
            <mesh>
              <planeGeometry args={[0.1, 0.035]} />
              <meshBasicMaterial color="#991b1b" side={THREE.DoubleSide} />
            </mesh>
            <Text
              position={[0, 0, 0.001]}
              fontSize={0.012}
              color="white"
              anchorX="center"
              anchorY="middle"
            >
              Leave
            </Text>
          </group>

          {/* End button (host only) */}
          {isHost && (
            <group
              position={[0.06, -0.1, 0.001]}
              onClick={handleEndSession}
            >
              <mesh>
                <planeGeometry args={[0.1, 0.035]} />
                <meshBasicMaterial color="#7f1d1d" side={THREE.DoubleSide} />
              </mesh>
              <Text
                position={[0, 0, 0.001]}
                fontSize={0.012}
                color="white"
                anchorX="center"
                anchorY="middle"
              >
                End
              </Text>
            </group>
          )}

          {/* Back button */}
          <group
            position={[0, -0.14, 0.001]}
            onClick={() => setMode('tools')}
          >
            <Text
              position={[0, 0, 0.001]}
              fontSize={0.011}
              color="#6b7280"
              anchorX="center"
              anchorY="middle"
            >
              Back
            </Text>
          </group>
        </>
      )
    }

    // Solo mode: Create or Join
    return (
      <>
        <Text
          position={[0, 0.08, 0.001]}
          fontSize={0.016}
          color="white"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          Session
        </Text>

        {/* Create button */}
        <group position={[0, 0.03, 0.001]} onClick={handleCreateSession}>
          <mesh>
            <planeGeometry args={[0.16, 0.04]} />
            <meshBasicMaterial color="#4f46e5" side={THREE.DoubleSide} />
          </mesh>
          <Text
            position={[0, 0, 0.001]}
            fontSize={0.013}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            Create Session
          </Text>
        </group>

        {/* Join button */}
        <group
          position={[0, -0.02, 0.001]}
          onClick={() => {
            setMode('vr-code-input')
            setCodeInput('')
          }}
        >
          <mesh>
            <planeGeometry args={[0.16, 0.04]} />
            <meshBasicMaterial color="#374151" side={THREE.DoubleSide} />
          </mesh>
          <Text
            position={[0, 0, 0.001]}
            fontSize={0.013}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            Join Session
          </Text>
        </group>

        {/* Back */}
        <group position={[0, -0.08, 0.001]} onClick={() => setMode('tools')}>
          <Text
            position={[0, 0, 0.001]}
            fontSize={0.011}
            color="#6b7280"
            anchorX="center"
            anchorY="middle"
          >
            Back
          </Text>
        </group>
      </>
    )
  }

  function CodeInputView() {
    const COLS = 6
    const ROWS = Math.ceil(CODE_CHARS.length / COLS)
    const KEY_SIZE = 0.035
    const GAP = 0.005

    return (
      <>
        {/* Title */}
        <Text
          position={[0, 0.18, 0.001]}
          fontSize={0.014}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          Enter Session Code
        </Text>

        {/* Current code display */}
        <group position={[0, 0.13, 0.001]}>
          {Array.from({ length: 6 }).map((_, i) => (
            <group key={i} position={[(i - 2.5) * 0.04, 0, 0]}>
              <mesh>
                <planeGeometry args={[0.032, 0.04]} />
                <meshBasicMaterial
                  color={i < codeInput.length ? '#1e1b4b' : '#1f2937'}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <Text
                position={[0, 0, 0.001]}
                fontSize={0.022}
                color="white"
                anchorX="center"
                anchorY="middle"
              >
                {codeInput[i] || '_'}
              </Text>
            </group>
          ))}
        </group>

        {/* Character keyboard */}
        {CODE_CHARS.map((char, i) => {
          const col = i % COLS
          const row = Math.floor(i / COLS)
          const x = (col - (COLS - 1) / 2) * (KEY_SIZE + GAP)
          const y = 0.06 - row * (KEY_SIZE + GAP)

          return (
            <group
              key={char}
              position={[x, y, 0.001]}
              onClick={() => handleCodeChar(char)}
            >
              <mesh>
                <planeGeometry args={[KEY_SIZE, KEY_SIZE]} />
                <meshBasicMaterial color="#374151" side={THREE.DoubleSide} />
              </mesh>
              <Text
                position={[0, 0, 0.001]}
                fontSize={0.015}
                color="white"
                anchorX="center"
                anchorY="middle"
              >
                {char}
              </Text>
            </group>
          )
        })}

        {/* Back / Clear buttons */}
        <group
          position={[-0.06, -0.14, 0.001]}
          onClick={() => {
            setMode('session')
            setCodeInput('')
          }}
        >
          <Text
            position={[0, 0, 0.001]}
            fontSize={0.011}
            color="#6b7280"
            anchorX="center"
            anchorY="middle"
          >
            Back
          </Text>
        </group>
        <group
          position={[0.06, -0.14, 0.001]}
          onClick={() => setCodeInput('')}
        >
          <Text
            position={[0, 0, 0.001]}
            fontSize={0.011}
            color="#ef4444"
            anchorX="center"
            anchorY="middle"
          >
            Clear
          </Text>
        </group>
      </>
    )
  }
}
