import { useEffect, useState } from 'react'
import { useViewerStore, type EnvironmentPreset } from '@/stores/viewer-store'
import { useToolStore } from '@/stores/tool-store'
import { useAuthContext } from '@/hooks/useAuthContext'
import { isFirebaseAvailable } from '@/lib/firebase'

const SETTINGS_KEY = 'vr-scout:settings'

interface PersistedSettings {
  measurementUnit: 'meters' | 'feet'
  movementSpeed: number
  mouseSensitivity: number
  environmentPreset: EnvironmentPreset
  showGrid: boolean
  showBackground: boolean
  showStats: boolean
}

function loadSettings(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveSettings(settings: Partial<PersistedSettings>) {
  try {
    const current = loadSettings()
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...current, ...settings })
    )
  } catch {
    // ignore
  }
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useAuthContext()

  const environmentPreset = useViewerStore((s) => s.environmentPreset)
  const setEnvironmentPreset = useViewerStore((s) => s.setEnvironmentPreset)
  const showGrid = useViewerStore((s) => s.showGrid)
  const setShowGrid = useViewerStore((s) => s.setShowGrid)
  const showBackground = useViewerStore((s) => s.showBackground)
  const setShowBackground = useViewerStore((s) => s.setShowBackground)
  const showStats = useViewerStore((s) => s.showStats)
  const setShowStats = useViewerStore((s) => s.setShowStats)
  const ambientIntensity = useViewerStore((s) => s.ambientIntensity)
  const setAmbientIntensity = useViewerStore((s) => s.setAmbientIntensity)
  const directionalIntensity = useViewerStore((s) => s.directionalIntensity)
  const setDirectionalIntensity = useViewerStore(
    (s) => s.setDirectionalIntensity
  )
  const fogDistance = useViewerStore((s) => s.fogDistance)
  const setFogDistance = useViewerStore((s) => s.setFogDistance)

  const measurementUnit = useToolStore((s) => s.measurementUnit)
  const setMeasurementUnit = useToolStore((s) => s.setMeasurementUnit)

  const [movementSpeed, setMovementSpeed] = useState(4)
  const [mouseSensitivity, setMouseSensitivity] = useState(1)

  // Load persisted settings on mount
  useEffect(() => {
    const saved = loadSettings()
    if (saved.measurementUnit) setMeasurementUnit(saved.measurementUnit)
    if (saved.environmentPreset) setEnvironmentPreset(saved.environmentPreset)
    if (saved.showGrid !== undefined) setShowGrid(saved.showGrid)
    if (saved.showBackground !== undefined)
      setShowBackground(saved.showBackground)
    if (saved.showStats !== undefined) setShowStats(saved.showStats)
    if (saved.movementSpeed) setMovementSpeed(saved.movementSpeed)
    if (saved.mouseSensitivity) setMouseSensitivity(saved.mouseSensitivity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist changes
  function persist(key: keyof PersistedSettings, value: unknown) {
    saveSettings({ [key]: value })
  }

  const PRESETS: EnvironmentPreset[] = [
    'apartment',
    'city',
    'dawn',
    'forest',
    'lobby',
    'night',
    'park',
    'studio',
    'sunset',
    'warehouse',
    'neutral',
  ]

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex justify-end">
      <div
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative bg-gray-900 border-l border-gray-700 w-80 h-full overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-white font-semibold text-sm">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            x
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Display */}
          <Section title="Display">
            <Label text="Environment Preset">
              <select
                value={environmentPreset}
                onChange={(e) => {
                  const v = e.target.value as EnvironmentPreset
                  setEnvironmentPreset(v)
                  persist('environmentPreset', v)
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white"
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </Label>

            <Slider
              label="Ambient Light"
              value={ambientIntensity}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => setAmbientIntensity(v)}
            />
            <Slider
              label="Directional Light"
              value={directionalIntensity}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => setDirectionalIntensity(v)}
            />
            <Slider
              label="Fog Distance"
              value={fogDistance}
              min={10}
              max={500}
              step={10}
              onChange={(v) => setFogDistance(v)}
            />

            <Toggle
              label="Show Grid"
              checked={showGrid}
              onChange={(v) => {
                setShowGrid(v)
                persist('showGrid', v)
              }}
            />
            <Toggle
              label="Show Background"
              checked={showBackground}
              onChange={(v) => {
                setShowBackground(v)
                persist('showBackground', v)
              }}
            />
            <Toggle
              label="Show Stats"
              checked={showStats}
              onChange={(v) => {
                setShowStats(v)
                persist('showStats', v)
              }}
            />
          </Section>

          {/* Controls */}
          <Section title="Controls">
            <Slider
              label="Movement Speed"
              value={movementSpeed}
              min={1}
              max={16}
              step={1}
              onChange={(v) => {
                setMovementSpeed(v)
                persist('movementSpeed', v)
                // Dispatch event for FP controls to pick up
                window.dispatchEvent(
                  new CustomEvent('settings-change', {
                    detail: { movementSpeed: v },
                  })
                )
              }}
              displayValue={`${movementSpeed} m/s`}
            />
            <Slider
              label="Mouse Sensitivity"
              value={mouseSensitivity}
              min={0.1}
              max={3}
              step={0.1}
              onChange={(v) => {
                setMouseSensitivity(v)
                persist('mouseSensitivity', v)
                window.dispatchEvent(
                  new CustomEvent('settings-change', {
                    detail: { mouseSensitivity: v },
                  })
                )
              }}
              displayValue={`${mouseSensitivity.toFixed(1)}x`}
            />
          </Section>

          {/* Tools */}
          <Section title="Tools">
            <Label text="Measurement Unit">
              <div className="flex gap-2">
                {(['meters', 'feet'] as const).map((unit) => (
                  <button
                    key={unit}
                    onClick={() => {
                      setMeasurementUnit(unit)
                      persist('measurementUnit', unit)
                    }}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      measurementUnit === unit
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {unit.charAt(0).toUpperCase() + unit.slice(1)}
                  </button>
                ))}
              </div>
            </Label>
          </Section>

          {/* Account */}
          <Section title="Account">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-white text-sm font-medium">
                {user.displayName || 'User'}
              </p>
              {user.email && (
                <p className="text-gray-400 text-xs">{user.email}</p>
              )}
              {user.isAnonymous && (
                <p className="text-amber-400 text-xs mt-1">Guest account</p>
              )}
              <p className="text-gray-500 text-[10px] mt-1">
                {isFirebaseAvailable()
                  ? 'Cloud sync enabled'
                  : 'Local mode (no cloud sync)'}
              </p>
            </div>
            <button
              onClick={signOut}
              className="w-full mt-2 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded text-xs transition-colors"
            >
              Sign Out
            </button>
          </Section>
        </div>
      </div>
    </div>
  )
}

// ---- Sub-components ----

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold mb-2">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Label({
  text,
  children,
}: {
  text: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{text}</label>
      {children}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  displayValue,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  displayValue?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-gray-300">
          {displayValue ?? value.toFixed(1)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs text-gray-400">{label}</span>
      <div
        className={`w-8 h-4 rounded-full transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-gray-700'
        } relative`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  )
}
