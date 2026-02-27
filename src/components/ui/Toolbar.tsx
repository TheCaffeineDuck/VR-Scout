import { useEffect, useState } from 'react'
import { useToolStore } from '@/stores/tool-store'
import { useSessionStore } from '@/stores/session-store'
import { useCollaboration } from '@/hooks/useCollaboration'
import { useVoiceChatStore } from '@/hooks/useVoiceChat'
import { useMeasurementStore } from '@/hooks/useMeasurement'
import { useAnnotationStore } from '@/hooks/useAnnotations'
import { SessionSharePanel } from '@/components/collaboration/SessionSharePanel'
import { JoinSessionInput } from '@/components/collaboration/JoinSessionInput'
import type { ToolType } from '@/types/tools'

interface ToolButton {
  tool: ToolType
  label: string
  icon: string
  shortcut: string
}

const TOOLS: ToolButton[] = [
  { tool: 'navigate',   label: 'Navigate',   icon: '\uD83E\uDDED', shortcut: '1' },
  { tool: 'measure',    label: 'Measure',     icon: '\uD83D\uDCCF', shortcut: '2' },
  { tool: 'annotate',   label: 'Annotate',    icon: '\uD83D\uDCCC', shortcut: '3' },
  { tool: 'camera',     label: 'Camera',      icon: '\uD83C\uDFA5', shortcut: '4' },
  { tool: 'screenshot', label: 'Screenshot',  icon: '\uD83D\uDCF7', shortcut: '5' },
  { tool: 'sunpath',    label: 'Sun Path',    icon: '\u2600',  shortcut: '6' },
  { tool: 'floorplan',  label: 'Floor Plan',  icon: '\uD83D\uDDFA', shortcut: '7' },
  { tool: 'laser',      label: 'Laser',       icon: '\uD83D\uDD34', shortcut: '8' },
  { tool: 'compare',    label: 'Compare',     icon: '\u2696',  shortcut: '9' },
]

export function Toolbar({
  onOpenSettings,
  onOpenGallery,
  onOpenSubscription,
  onOpenDashboard,
  onInviteOthers,
}: {
  onOpenSettings?: () => void
  onOpenGallery?: () => void
  onOpenSubscription?: () => void
  onOpenDashboard?: () => void
  onInviteOthers?: () => void
}) {
  const activeTool = useToolStore((s) => s.activeTool)
  const setActiveTool = useToolStore((s) => s.setActiveTool)
  const measurementUnit = useToolStore((s) => s.measurementUnit)
  const setMeasurementUnit = useToolStore((s) => s.setMeasurementUnit)
  const measurements = useMeasurementStore((s) => s.measurements)
  const clearMeasurements = useMeasurementStore((s) => s.clearMeasurements)
  const annotations = useAnnotationStore((s) => s.annotations)

  // Collaboration state
  const currentSession = useSessionStore((s) => s.currentSession)
  const isCollaborative = useSessionStore((s) => s.isCollaborative)
  const connectionStatus = useSessionStore((s) => s.connectionStatus)
  const participants = useSessionStore((s) => s.participants)
  const { localUid } = useCollaboration()
  const isMuted = useVoiceChatStore((s) => s.isMuted)
  const setMuted = useVoiceChatStore((s) => s.setMuted)

  const [showSessionPanel, setShowSessionPanel] = useState(false)
  const [showJoinInput, setShowJoinInput] = useState(false)

  const isHost = currentSession?.hostUid === localUid
  const isInSession = isCollaborative && connectionStatus === 'connected'

  // Keyboard shortcuts (1-9)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < TOOLS.length) {
        setActiveTool(TOOLS[idx].tool)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveTool])

  const handleToolClick = (tool: ToolType) => {
    if (tool === 'screenshot') {
      window.dispatchEvent(new CustomEvent('take-screenshot'))
      return
    }
    setActiveTool(tool)
  }

  return (
    <>
      <nav
        role="toolbar"
        aria-label="Scouting tools"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-gray-900/95 rounded-xl px-2 py-1.5 shadow-xl border border-gray-800"
      >
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            onClick={() => handleToolClick(t.tool)}
            aria-label={`${t.label} tool (keyboard shortcut ${t.shortcut})`}
            aria-pressed={activeTool === t.tool}
            title={`${t.label} (${t.shortcut})`}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors min-w-[52px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${
              activeTool === t.tool
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span className="text-base leading-none" aria-hidden="true">{t.icon}</span>
            <span className="text-[9px] leading-none">{t.label}</span>
          </button>
        ))}

        {/* Divider */}
        <div className="w-px h-8 bg-gray-700 mx-1" role="separator" />

        {/* Unit toggle */}
        <button
          onClick={() => setMeasurementUnit(measurementUnit === 'meters' ? 'feet' : 'meters')}
          className="text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          aria-label={`Measurement unit: ${measurementUnit}. Click to toggle.`}
          title="Toggle measurement unit"
        >
          {measurementUnit === 'meters' ? 'm' : 'ft'}
        </button>

        {/* Status indicators */}
        {measurements.length > 0 && (
          <button
            onClick={clearMeasurements}
            className="text-[10px] text-gray-500 hover:text-red-400 px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            aria-label={`${measurements.length} measurements. Click to clear.`}
            title="Clear measurements"
          >
            {measurements.length} meas
          </button>
        )}
        {annotations.length > 0 && (
          <span className="text-[10px] text-gray-500 px-1" aria-label={`${annotations.length} annotations`}>
            {annotations.length} ann
          </span>
        )}

        {/* Divider */}
        <div className="w-px h-8 bg-gray-700 mx-1" role="separator" />

        {/* === Collaboration section === */}
        {isInSession ? (
          <>
            {/* Session active indicator */}
            <button
              onClick={() => setShowSessionPanel(!showSessionPanel)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-gray-800"
              aria-label={`${isHost ? 'Session active' : 'In session'} - ${participants.length} participants`}
              title="Session panel"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-400 text-[9px]">
                {isHost ? 'Hosting' : 'In Session'}
              </span>
              <span className="bg-gray-700 text-gray-300 text-[9px] rounded-full px-1.5 min-w-[18px] text-center">
                {participants.length}
              </span>
            </button>

            {/* Mute toggle */}
            <button
              onClick={() => setMuted(!isMuted)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                isMuted
                  ? 'text-red-400 hover:bg-red-900/30'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <span className="text-sm" aria-hidden="true">
                {isMuted ? '\uD83D\uDD07' : '\uD83C\uDF99'}
              </span>
            </button>
          </>
        ) : (
          <>
            {/* Invite Others */}
            <button
              onClick={onInviteOthers}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              aria-label="Invite others to collaborate"
              title="Invite Others"
            >
              <span className="text-sm" aria-hidden="true">{'\uD83D\uDC65'}</span>
              <span className="text-[9px]">Invite</span>
            </button>

            {/* Join Session */}
            <button
              onClick={() => setShowJoinInput(!showJoinInput)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              aria-label="Join a session by code"
              title="Join Session"
            >
              <span className="text-sm" aria-hidden="true">{'\uD83D\uDD17'}</span>
              <span className="text-[9px]">Join</span>
            </button>
          </>
        )}

        {/* Divider */}
        <div className="w-px h-8 bg-gray-700 mx-1" role="separator" />

        {/* Gallery button */}
        {onOpenGallery && (
          <button
            onClick={onOpenGallery}
            className="text-gray-400 hover:text-white px-2 py-1 rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            aria-label="Open screenshot gallery"
            title="Screenshot Gallery"
          >
            <span aria-hidden="true">{'\uD83D\uDDBC'}</span>
          </button>
        )}

        {/* Dashboard button */}
        {onOpenDashboard && (
          <button
            onClick={onOpenDashboard}
            className="text-gray-400 hover:text-white px-2 py-1 rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            aria-label="Open dashboard"
            title="Dashboard"
          >
            <span aria-hidden="true">&#9783;</span>
          </button>
        )}

        {/* Subscription button */}
        {onOpenSubscription && (
          <button
            onClick={onOpenSubscription}
            className="text-gray-400 hover:text-white px-2 py-1 rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            aria-label="Open subscription plans"
            title="Subscription"
          >
            <span aria-hidden="true">&#9734;</span>
          </button>
        )}

        {/* Settings button */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="text-gray-400 hover:text-white px-2 py-1 rounded text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            aria-label="Open settings"
            title="Settings"
          >
            <span aria-hidden="true">{'\u2699'}</span>
          </button>
        )}
      </nav>

      {/* Session Share Panel popover */}
      {showSessionPanel && isInSession && (
        <SessionSharePanel onClose={() => setShowSessionPanel(false)} />
      )}

      {/* Join Session code input popover */}
      {showJoinInput && !isInSession && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 rounded-xl border border-gray-700 shadow-xl p-3 backdrop-blur-sm">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
            Enter Session Code
          </div>
          <JoinSessionInput
            inline
            onClose={() => setShowJoinInput(false)}
          />
        </div>
      )}
    </>
  )
}
