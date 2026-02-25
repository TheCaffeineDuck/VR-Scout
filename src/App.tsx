import { useEffect, useState, lazy, Suspense } from 'react'
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
import { SessionManager } from '@/components/collaboration/SessionManager'
import { ParticipantList } from '@/components/collaboration/ParticipantList'
import { SharedToolSync } from '@/components/collaboration/SharedToolSync'
import { VoiceChatControls } from '@/components/collaboration/VoiceChatControls'
import { AuthGate } from '@/components/ui/AuthGate'
import { UserMenu } from '@/components/ui/UserMenu'
import { enterVR } from '@/hooks/useXRSession'
import { useViewerStore } from '@/stores/viewer-store'
import { useToolStore } from '@/stores/tool-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useAuthContext } from '@/hooks/useAuthContext'

// Lazy-loaded panels (only loaded when opened)
const ComparisonViewer = lazy(() => import('@/components/comparison/ComparisonViewer').then(m => ({ default: m.ComparisonViewer })))
const SettingsPanel = lazy(() => import('@/components/ui/SettingsPanel').then(m => ({ default: m.SettingsPanel })))
const ScreenshotGallery = lazy(() => import('@/components/ui/ScreenshotGallery').then(m => ({ default: m.ScreenshotGallery })))
const SubscriptionPanel = lazy(() => import('@/components/ui/SubscriptionPanel').then(m => ({ default: m.SubscriptionPanel })))
const Dashboard = lazy(() => import('@/components/dashboard/Dashboard').then(m => ({ default: m.Dashboard })))

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <AppContent />
      </AuthGate>
    </ErrorBoundary>
  )
}

function AppContent() {
  const { user } = useAuthContext()
  const setSceneLOD = useViewerStore((s) => s.setSceneLOD)
  const sceneLOD = useViewerStore((s) => s.sceneLOD)
  const sceneUrl = useViewerStore((s) => s.sceneUrl)
  const activeTool = useToolStore((s) => s.activeTool)
  const loadSubscription = useSubscriptionStore((s) => s.loadSubscription)
  const [showComparison, setShowComparison] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [showSubscription, setShowSubscription] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)

  // Load subscription on auth
  useEffect(() => {
    if (user) {
      loadSubscription(user.uid)
    }
  }, [user, loadSubscription])

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

  // Restore high contrast mode from localStorage
  useEffect(() => {
    try {
      if (localStorage.getItem('vr-scout:high-contrast') === 'true') {
        document.documentElement.classList.add('high-contrast')
      }
    } catch {}
  }, [])

  return (
    <>
      {/* Skip link for keyboard users */}
      <a href="#main-viewer" className="skip-link">
        Skip to viewer
      </a>

      <main id="main-viewer" role="main" aria-label="3D Scene Viewer">
        <ViewerShell>
          <SceneRenderer />
        </ViewerShell>
      </main>

      {/* Collaboration */}
      <SessionManager />
      <ParticipantList />
      <SharedToolSync />
      <VoiceChatControls />

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
      <Toolbar
        onOpenSettings={() => setShowSettings(true)}
        onOpenGallery={() => setShowGallery(true)}
        onOpenSubscription={() => setShowSubscription(true)}
        onOpenDashboard={() => setShowDashboard(true)}
      />

      {/* Top-right action buttons */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2" role="group" aria-label="Quick actions">
        <UserMenu />
        <CameraSpawnButton />
        <ScreenshotButton />
        <button
          onClick={enterVR}
          aria-label="Enter VR mode"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium text-xs shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          Enter VR
        </button>
      </div>

      {/* Lazy-loaded modal panels */}
      <Suspense fallback={null}>
        {showComparison && (
          <ComparisonViewer onClose={() => setShowComparison(false)} />
        )}
        {showSettings && (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        )}
        {showGallery && (
          <ScreenshotGallery onClose={() => setShowGallery(false)} />
        )}
        {showSubscription && (
          <SubscriptionPanel onClose={() => setShowSubscription(false)} />
        )}
        {showDashboard && (
          <Dashboard
            onClose={() => setShowDashboard(false)}
            onLoadTour={(tour) => {
              setSceneLOD(tour.meshUrls)
              setShowDashboard(false)
            }}
          />
        )}
      </Suspense>
    </>
  )
}
