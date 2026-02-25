import { useEffect } from 'react'
import { useToolStore } from '@/stores/tool-store'
import { useMeasurementStore } from '@/hooks/useMeasurement'
import { useAnnotationStore } from '@/hooks/useAnnotations'
import type { ToolType } from '@/types/tools'

interface ToolButton {
  tool: ToolType
  label: string
  icon: string
  shortcut: string
}

const TOOLS: ToolButton[] = [
  { tool: 'navigate',   label: 'Navigate',   icon: '🧭', shortcut: '1' },
  { tool: 'measure',    label: 'Measure',     icon: '📏', shortcut: '2' },
  { tool: 'annotate',   label: 'Annotate',    icon: '📌', shortcut: '3' },
  { tool: 'camera',     label: 'Camera',      icon: '🎥', shortcut: '4' },
  { tool: 'screenshot', label: 'Screenshot',  icon: '📷', shortcut: '5' },
  { tool: 'sunpath',    label: 'Sun Path',    icon: '☀',  shortcut: '6' },
  { tool: 'floorplan',  label: 'Floor Plan',  icon: '🗺', shortcut: '7' },
  { tool: 'laser',      label: 'Laser',       icon: '🔴', shortcut: '8' },
  { tool: 'compare',    label: 'Compare',     icon: '⚖',  shortcut: '9' },
]

export function Toolbar({
  onOpenSettings,
  onOpenGallery,
  onOpenSubscription,
  onOpenDashboard,
}: {
  onOpenSettings?: () => void
  onOpenGallery?: () => void
  onOpenSubscription?: () => void
  onOpenDashboard?: () => void
}) {
  const activeTool = useToolStore((s) => s.activeTool)
  const setActiveTool = useToolStore((s) => s.setActiveTool)
  const measurementUnit = useToolStore((s) => s.measurementUnit)
  const setMeasurementUnit = useToolStore((s) => s.setMeasurementUnit)
  const measurements = useMeasurementStore((s) => s.measurements)
  const clearMeasurements = useMeasurementStore((s) => s.clearMeasurements)
  const annotations = useAnnotationStore((s) => s.annotations)

  // Keyboard shortcuts (1-9)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // Ignore if modifier keys are pressed
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < TOOLS.length) {
        setActiveTool(TOOLS[idx].tool)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveTool])

  // Screenshot triggers via toolbar
  const handleToolClick = (tool: ToolType) => {
    if (tool === 'screenshot') {
      window.dispatchEvent(new CustomEvent('take-screenshot'))
      return
    }
    setActiveTool(tool)
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-gray-900/95 rounded-xl px-2 py-1.5 shadow-xl border border-gray-800">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          onClick={() => handleToolClick(t.tool)}
          title={`${t.label} (${t.shortcut})`}
          className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors min-w-[52px] ${
            activeTool === t.tool
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`}
        >
          <span className="text-base leading-none">{t.icon}</span>
          <span className="text-[9px] leading-none">{t.label}</span>
        </button>
      ))}

      {/* Divider */}
      <div className="w-px h-8 bg-gray-700 mx-1" />

      {/* Unit toggle */}
      <button
        onClick={() => setMeasurementUnit(measurementUnit === 'meters' ? 'feet' : 'meters')}
        className="text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded"
        title="Toggle measurement unit"
      >
        {measurementUnit === 'meters' ? 'm' : 'ft'}
      </button>

      {/* Status indicators */}
      {measurements.length > 0 && (
        <button
          onClick={clearMeasurements}
          className="text-[10px] text-gray-500 hover:text-red-400 px-1"
          title="Clear measurements"
        >
          {measurements.length} meas
        </button>
      )}
      {annotations.length > 0 && (
        <span className="text-[10px] text-gray-500 px-1">
          {annotations.length} ann
        </span>
      )}

      {/* Divider */}
      <div className="w-px h-8 bg-gray-700 mx-1" />

      {/* Gallery button */}
      {onOpenGallery && (
        <button
          onClick={onOpenGallery}
          className="text-gray-400 hover:text-white px-2 py-1 rounded text-sm"
          title="Screenshot Gallery"
        >
          🖼
        </button>
      )}

      {/* Dashboard button */}
      {onOpenDashboard && (
        <button
          onClick={onOpenDashboard}
          className="text-gray-400 hover:text-white px-2 py-1 rounded text-sm"
          title="Dashboard"
        >
          &#9783;
        </button>
      )}

      {/* Subscription button */}
      {onOpenSubscription && (
        <button
          onClick={onOpenSubscription}
          className="text-gray-400 hover:text-white px-2 py-1 rounded text-sm"
          title="Subscription"
        >
          &#9734;
        </button>
      )}

      {/* Settings button */}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="text-gray-400 hover:text-white px-2 py-1 rounded text-sm"
          title="Settings"
        >
          ⚙
        </button>
      )}
    </div>
  )
}
