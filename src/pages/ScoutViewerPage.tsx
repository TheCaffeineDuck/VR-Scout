import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ScoutViewer } from '@/components/viewer/ScoutViewer'
import { useAuthContext } from '@/hooks/useAuthContext'
import { useSubscriptionStore } from '@/stores/subscription-store'

export function ScoutViewerPage() {
  const { locationId } = useParams<{ locationId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('session')

  const { user } = useAuthContext()
  const tier = useSubscriptionStore((s) => s.subscription?.tier ?? 'free')

  if (!locationId) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-bold text-white mb-2">
            No Location Specified
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Please provide a location ID in the URL.
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Back to Launcher
          </button>
        </div>
      </div>
    )
  }

  return (
    <ScoutViewer
      locationId={locationId}
      sessionId={sessionId}
      user={
        user
          ? {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
            }
          : null
      }
      tier={tier}
      onExit={() => navigate('/')}
    />
  )
}
