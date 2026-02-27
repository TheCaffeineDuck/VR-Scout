import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { ViewerShell } from '@/components/viewer/ViewerShell'
import { SceneRenderer } from '@/components/viewer/SceneRenderer'
import { EnvironmentPanel } from '@/components/viewer/EnvironmentSettings'
import { LoadingOverlay } from '@/components/viewer/LoadingOverlay'
import { PerformanceKeyHandler } from '@/components/viewer/PerformanceMonitor'
import { Toolbar } from '@/components/ui/Toolbar'
import { SunPathPanel } from '@/components/tools/SunPathSimulator'
import { FloorPlanMinimap } from '@/components/tools/FloorPlanOverlay'
import { LensRadialMenu } from '@/components/camera-system/LensRadialMenu'
import { CameraSpawnButton } from '@/components/camera-system/CameraSpawnMenu'
import { ScreenshotButton } from '@/components/tools/ScreenshotTool'
import { SharedToolSync } from '@/components/collaboration/SharedToolSync'
import { VoiceChatControls } from '@/components/collaboration/VoiceChatControls'
import { SessionSharePanel } from '@/components/collaboration/SessionSharePanel'
import { UserMenu } from '@/components/ui/UserMenu'
import { enterVR } from '@/hooks/useXRSession'
import { useViewerStore } from '@/stores/viewer-store'
import { useToolStore } from '@/stores/tool-store'
import { useSessionStore } from '@/stores/session-store'
import { useTour } from '@/hooks/useTour'
import { useCollaboration } from '@/hooks/useCollaboration'
import {
  createSession as createFirestoreSession,
  isAccessCodeTaken,
} from '@/lib/firestore/sessions'

const ComparisonViewer = lazy(() =>
  import('@/components/comparison/ComparisonViewer').then((m) => ({
    default: m.ComparisonViewer,
  })),
)
const SettingsPanel = lazy(() =>
  import('@/components/ui/SettingsPanel').then((m) => ({
    default: m.SettingsPanel,
  })),
)
const ScreenshotGallery = lazy(() =>
  import('@/components/ui/ScreenshotGallery').then((m) => ({
    default: m.ScreenshotGallery,
  })),
)
const SubscriptionPanel = lazy(() =>
  import('@/components/ui/SubscriptionPanel').then((m) => ({
    default: m.SubscriptionPanel,
  })),
)
const Dashboard = lazy(() =>
  import('@/components/dashboard/Dashboard').then((m) => ({
    default: m.Dashboard,
  })),
)

// Generate a 6-character access code (no ambiguous chars: 0/O, 1/I/L)
function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

async function generateUniqueAccessCode(): Promise<string> {
  let code = generateAccessCode()
  let attempts = 0
  while ((await isAccessCodeTaken(code)) && attempts < 5) {
    code = generateAccessCode()
    attempts++
  }
  return code
}

export interface ScoutViewerProps {
  locationId: string
  sessionId?: string | null
  user: {
    uid: string
    displayName: string | null
    email: string | null
  } | null
  tier: 'free' | 'scout' | 'studio'
  onExit?: () => void
}

export function ScoutViewer({
  locationId,
  sessionId,
  user,
  tier,
  onExit,
}: ScoutViewerProps) {
  const setSceneLOD = useViewerStore((s) => s.setSceneLOD)
  const activeTool = useToolStore((s) => s.activeTool)
  const { tour, loading: tourLoading, error: tourError } = useTour(locationId)
  const {
    currentSession,
    createSession,
    joinSession,
    leaveSession,
    connectionStatus,
    isCollaborative,
    localUid,
  } = useCollaboration()

  const [showComparison, setShowComparison] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [showSubscription, setShowSubscription] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [sessionBanner, setSessionBanner] = useState<string | null>(null)
  const [sessionAutoConnected, setSessionAutoConnected] = useState(false)

  // Load scene from tour data
  useEffect(() => {
    if (tour) {
      setSceneLOD(tour.splatUrls)
    }
  }, [tour, setSceneLOD])

  // Open comparison viewer when compare tool is selected
  useEffect(() => {
    if (activeTool === 'compare') {
      setShowComparison(true)
    }
  }, [activeTool])

  // "Invite Others" creates a new session with Firestore persistence + access code
  const handleCreateSession = useCallback(
    async (displayNameOverride?: string) => {
      const displayName =
        displayNameOverride || user?.displayName || user?.email || 'Anonymous'
      const collabSession = await createSession(displayName)
      if (!collabSession) {
        setSessionBanner("Failed to create session. You're in solo mode.")
        return
      }

      // Generate access code and persist to Firestore
      const accessCode = await generateUniqueAccessCode()
      try {
        const fsSession = await createFirestoreSession({
          locationId,
          virtualTourId: tour?.id || locationId,
          sessionType: 'collaborative',
          status: 'active',
          accessCode,
          hostUid: collabSession.localUid,
          participants: [],
          virtualCameras: [],
          croquetSessionId: collabSession.sessionId,
          livekitRoomName: `vr-scout-${collabSession.sessionId}`,
        })

        // Update the Zustand session with the Firestore data
        useSessionStore.getState().setCurrentSession({
          ...useSessionStore.getState().currentSession!,
          id: fsSession.id,
          locationId,
          virtualTourId: tour?.id || locationId,
          accessCode,
        })

        setShowSharePanel(true)
      } catch {
        // Session was created in Croquet but Firestore failed —
        // still functional, just no access code
        setSessionBanner(
          'Session created (sharing unavailable without backend)',
        )
        setTimeout(() => setSessionBanner(null), 4000)
      }
    },
    [user, createSession, locationId, tour],
  )

  // Session auto-connect (runs once when tour + user are ready)
  useEffect(() => {
    if (!sessionId || !user || !tour || sessionAutoConnected) return
    setSessionAutoConnected(true)

    const displayName = user.displayName || user.email || 'Anonymous'

    if (sessionId === 'new') {
      handleCreateSession(displayName)
    } else {
      joinSession(displayName, sessionId).then((session) => {
        if (!session) {
          setSessionBanner('Could not join session \u2014 exploring solo')
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user, tour])

  // Listen for session-ended events from the host
  useEffect(() => {
    const handleSessionEnded = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.reason === 'host') {
        setSessionBanner('The host ended this session')
        setTimeout(() => setSessionBanner(null), 5000)
      }
    }
    window.addEventListener('session-ended', handleSessionEnded)
    return () =>
      window.removeEventListener('session-ended', handleSessionEnded)
  }, [])

  // VR menu events: create session, end session, join by code
  useEffect(() => {
    const onVRCreate = () => handleCreateSession()
    const onVREnd = () => {
      if (currentSession) {
        import('@/lib/firestore/sessions').then((mod) =>
          mod.endSession(currentSession.id).catch(() => {}),
        )
      }
      window.dispatchEvent(
        new CustomEvent('session-ended', { detail: { reason: 'host' } }),
      )
    }
    const onVRJoinCode = async (e: Event) => {
      const code = (e as CustomEvent).detail?.code
      if (!code) return
      try {
        const { getSessionByAccessCode } = await import(
          '@/lib/firestore/sessions'
        )
        const session = await getSessionByAccessCode(code)
        if (session) {
          const displayName =
            user?.displayName || user?.email || 'Anonymous'
          const result = await joinSession(displayName, session.id)
          if (!result) {
            setSessionBanner('Could not join session')
            setTimeout(() => setSessionBanner(null), 3000)
          }
        } else {
          setSessionBanner('No active session with that code')
          setTimeout(() => setSessionBanner(null), 3000)
        }
      } catch {
        setSessionBanner('Failed to look up session')
        setTimeout(() => setSessionBanner(null), 3000)
      }
    }

    window.addEventListener('vr-create-session', onVRCreate)
    window.addEventListener('vr-end-session', onVREnd)
    window.addEventListener('vr-join-session-code', onVRJoinCode)
    return () => {
      window.removeEventListener('vr-create-session', onVRCreate)
      window.removeEventListener('vr-end-session', onVREnd)
      window.removeEventListener('vr-join-session-code', onVRJoinCode)
    }
  }, [handleCreateSession, currentSession, user, joinSession])

  const handleInviteOthers = useCallback(() => {
    if (isCollaborative && connectionStatus === 'connected') {
      setShowSharePanel(true)
    } else {
      handleCreateSession()
    }
  }, [isCollaborative, connectionStatus, handleCreateSession])

  // Tour loading / error states
  if (tourLoading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading tour data...</p>
        </div>
      </div>
    )
  }

  if (tourError || !tour) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm text-center">
          <h2 className="text-lg font-bold text-white mb-2">Tour Not Found</h2>
          <p className="text-gray-400 text-sm mb-4">
            {tourError ||
              `No virtual tour found for location "${locationId}".`}
          </p>
          {onExit && (
            <button
              onClick={onExit}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Go Back
            </button>
          )}
        </div>
      </div>
    )
  }

  const isGuest = !user

  return (
    <>
      {/* Skip link for keyboard users */}
      <a href="#main-viewer" className="skip-link">
        Skip to viewer
      </a>

      <main id="main-viewer" role="main" aria-label="3D Scene Viewer" className="w-full h-full">
        <ViewerShell>
          <SceneRenderer />
        </ViewerShell>
      </main>

      {/* Session banner (toasts) */}
      {sessionBanner && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-amber-900/90 border border-amber-700/50 text-amber-200 px-4 py-2 rounded-lg text-sm backdrop-blur-sm flex items-center gap-3">
          <span>{sessionBanner}</span>
          <button
            onClick={() => setSessionBanner(null)}
            className="text-amber-400 hover:text-amber-200 font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Reconnection indicator */}
      {connectionStatus === 'connecting' && isCollaborative && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-gray-800/90 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm backdrop-blur-sm flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <span>Reconnecting...</span>
        </div>
      )}

      {/* Collaboration sync (invisible) */}
      <SharedToolSync />
      <VoiceChatControls />

      {/* Overlays */}
      <LoadingOverlay />
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
        onInviteOthers={handleInviteOthers}
      />

      {/* Session share panel */}
      {showSharePanel && (
        <SessionSharePanel onClose={() => setShowSharePanel(false)} />
      )}

      {/* Top-right action buttons */}
      <div
        className="fixed top-4 right-4 z-50 flex items-center gap-2"
        role="group"
        aria-label="Quick actions"
      >
        {onExit && (
          <button
            onClick={onExit}
            aria-label="Exit viewer"
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg font-medium text-xs shadow-lg"
          >
            Exit
          </button>
        )}
        <UserMenu />
        {!isGuest && <CameraSpawnButton />}
        {!isGuest && <ScreenshotButton />}
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
            onLoadTour={(loadedTour) => {
              setSceneLOD(loadedTour.splatUrls)
              setShowDashboard(false)
            }}
          />
        )}
      </Suspense>
    </>
  )
}
