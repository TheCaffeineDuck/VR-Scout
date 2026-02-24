import { useEffect, useRef, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { StatsGl } from '@react-three/drei'
import { useViewerStore } from '@/stores/viewer-store'

/**
 * FPS tracking for adaptive quality suggestions.
 * Runs inside the R3F Canvas.
 */
function AdaptiveQualityMonitor() {
  const currentLOD = useViewerStore((s) => s.currentLOD)
  const lowFpsStart = useRef<number | null>(null)
  const suggestionShown = useRef(false)
  const { gl } = useThree()

  useFrame((_state, delta) => {
    if (currentLOD === 'preview' || suggestionShown.current) return

    const fps = delta > 0 ? 1 / delta : 60

    if (fps < 30) {
      if (lowFpsStart.current === null) {
        lowFpsStart.current = performance.now()
      } else if (performance.now() - lowFpsStart.current > 3000) {
        // FPS below 30 for 3+ seconds
        suggestionShown.current = true
        const info = gl.info
        console.warn(
          `[Performance] FPS below 30 for 3+ seconds (current: ${fps.toFixed(0)} FPS). ` +
            `Draw calls: ${info.render?.calls ?? '?'}, ` +
            `Triangles: ${info.render?.triangles?.toLocaleString() ?? '?'}. ` +
            `Consider switching to a lower LOD.`,
        )
      }
    } else {
      lowFpsStart.current = null
    }
  })

  // Reset suggestion when LOD changes
  useEffect(() => {
    suggestionShown.current = false
    lowFpsStart.current = null
  }, [currentLOD])

  return null
}

/**
 * 3D component — place inside Canvas.
 * Shows stats-gl overlay and monitors adaptive quality.
 */
export function PerformanceStats() {
  const showStats = useViewerStore((s) => s.showStats)

  return (
    <>
      {showStats && <StatsGl />}
      <AdaptiveQualityMonitor />
    </>
  )
}

/**
 * HTML component — place outside Canvas.
 * Keyboard shortcut handler for toggling stats (backtick key).
 */
export function PerformanceKeyHandler() {
  const setShowStats = useViewerStore((s) => s.setShowStats)
  const showStats = useViewerStore((s) => s.showStats)

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === 'F3') {
        e.preventDefault()
        setShowStats(!showStats)
      }
    },
    [showStats, setShowStats],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return null
}
