import { useEffect, useState } from 'react'
import { ViewerShell } from '@/components/viewer/ViewerShell'
import { SceneRenderer } from '@/components/viewer/SceneRenderer'
import { EnvironmentPanel } from '@/components/viewer/EnvironmentSettings'
import { LoadingOverlay } from '@/components/viewer/LoadingOverlay'
import { ErrorBoundary } from '@/components/viewer/ErrorBoundary'
import { SceneSelector } from '@/components/viewer/SceneSelector'
import { PerformanceKeyHandler } from '@/components/viewer/PerformanceMonitor'
import { Toolbar } from '@/components/ui/Toolbar'
import { SunPathPanel } from '@/components/tools/SunPathSimulator'
import { FloorPlanMinimap } from '@/components/tools/FloorPlanOverlay'
import { LensRadialMenu } from '@/components/camera-system/LensRadialMenu'
import { CameraSpawnButton } from '@/components/camera-system/CameraSpawnMenu'
import { ScreenshotButton } from '@/components/tools/ScreenshotTool'
import { ComparisonViewer } from '@/components/comparison/ComparisonViewer'
import { SessionManager } from '@/components/collaboration/SessionManager'
import { enterVR } from '@/hooks/useXRSession'
import { useViewerStore } from '@/stores/viewer-store'
import { useToolStore } from '@/stores/tool-store'

export default function App() {
  const setSceneLOD = useViewerStore((s) => s.setSceneLOD)
  const sceneLOD = useViewerStore((s) => s.sceneLOD)
  const sceneUrl = useViewerStore((s) => s.sceneUrl)
  const activeTool = useToolStore((s) => s.activeTool)
  const [showComparison, setShowComparison] = useState(false)

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

  // Open comparison viewer when compare tool is selected
  useEffect(() => {
    if (activeTool === 'compare') {
      setShowComparison(true)
    }
  }, [activeTool])

  return (
    <ErrorBoundary>
      <ViewerShell>
        <SceneRenderer />
      </ViewerShell>

      {/* Collaboration */}
      <SessionManager />

      {/* Overlays */}
      <LoadingOverlay />
      <SceneSelector />
      <EnvironmentPanel />
      <PerformanceKeyHandler />

      {/* Tool panels */}
      <SunPathPanel />
      <FloorPlanMinimap />
      <LensRadialMenu />

      {/* Main toolbar */}
      <Toolbar />

      {/* Top-right action buttons */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <CameraSpawnButton />
        <ScreenshotButton />
        <button
          onClick={enterVR}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium text-xs shadow-lg"
        >
          Enter VR
        </button>
      </div>

      {/* Comparison viewer */}
      {showComparison && (
        <ComparisonViewer onClose={() => setShowComparison(false)} />
      )}
    </ErrorBoundary>
  )
}
