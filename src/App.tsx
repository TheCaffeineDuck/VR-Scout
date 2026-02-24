import { useEffect } from 'react'
import { ViewerShell } from '@/components/viewer/ViewerShell'
import { SceneRenderer } from '@/components/viewer/SceneRenderer'
import { EnvironmentPanel } from '@/components/viewer/EnvironmentSettings'
import { LoadingOverlay } from '@/components/viewer/LoadingOverlay'
import { ErrorBoundary } from '@/components/viewer/ErrorBoundary'
import { SceneSelector } from '@/components/viewer/SceneSelector'
import { PerformanceKeyHandler } from '@/components/viewer/PerformanceMonitor'
import { enterVR } from '@/hooks/useXRSession'
import { useViewerStore } from '@/stores/viewer-store'

export default function App() {
  const setSceneLOD = useViewerStore((s) => s.setSceneLOD)
  const sceneLOD = useViewerStore((s) => s.sceneLOD)
  const sceneUrl = useViewerStore((s) => s.sceneUrl)

  // Auto-load default scene on first mount
  useEffect(() => {
    if (!sceneLOD && !sceneUrl) {
      setSceneLOD({
        preview: '/scenes/room_preview.glb',
        medium: '/scenes/room_medium.glb',
        high: '/scenes/room_high.glb',
      })
    }
  }, [sceneLOD, sceneUrl, setSceneLOD])

  return (
    <ErrorBoundary>
      <ViewerShell>
        <SceneRenderer />
      </ViewerShell>
      <LoadingOverlay />
      <SceneSelector />
      <EnvironmentPanel />
      <PerformanceKeyHandler />
      <button
        onClick={enterVR}
        className="fixed bottom-4 right-4 z-50 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-lg"
      >
        Enter VR
      </button>
    </ErrorBoundary>
  )
}
