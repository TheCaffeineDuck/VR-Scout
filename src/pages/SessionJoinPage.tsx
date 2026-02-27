import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/hooks/useAuthContext'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { getSession } from '@/lib/firestore/sessions'
import type { VRSession } from '@/types/session'

export function SessionJoinPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthContext()
  const tier = useSubscriptionStore((s) => s.subscription?.tier ?? 'free')

  const [session, setSession] = useState<VRSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<'not-found' | 'ended' | 'generic'>('generic')

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided')
      setErrorType('not-found')
      setLoading(false)
      return
    }

    getSession(sessionId)
      .then((s) => {
        if (!s) {
          setError('Session not found. It may have ended or the link may be incorrect.')
          setErrorType('not-found')
        } else if (s.status !== 'active') {
          setError('This session has ended.')
          setErrorType('ended')
          setSession(s) // Keep session data for "Scout Solo" link
        } else {
          setSession(s)
        }
      })
      .catch(() => {
        setError('Failed to load session. Please try again.')
        setErrorType('generic')
      })
      .finally(() => setLoading(false))
  }, [sessionId])

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Looking up session...</p>
        </div>
      </div>
    )
  }

  // Error states
  if (error) {
    const locationId = session?.locationId || session?.virtualTourId

    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm text-center">
          <h2 className="text-lg font-bold text-white mb-2">
            {errorType === 'ended' ? 'Session Ended' : 'Session Not Found'}
          </h2>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <div className="flex flex-col gap-2">
            {/* If session ended, offer to scout solo */}
            {errorType === 'ended' && locationId && (
              <button
                onClick={() => navigate(`/scout/${locationId}`)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Scout Solo
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className={`w-full px-4 py-2 rounded-lg text-sm font-medium ${
                errorType === 'ended' && locationId
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              Browse Properties
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Auth check — user must be authenticated
  if (!user) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm text-center">
          <h2 className="text-lg font-bold text-white mb-2">Sign In Required</h2>
          <p className="text-gray-400 text-sm mb-4">
            You need to be signed in to join a collaborative session.
          </p>
          <p className="text-gray-500 text-xs">
            Sign in using the auth panel, then reload this page.
          </p>
        </div>
      </div>
    )
  }

  // Subscription gate (skip in dev mode for free tier)
  const isDev = import.meta.env.DEV
  if (!isDev && tier === 'free') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm text-center">
          <h2 className="text-lg font-bold text-white mb-2">Upgrade Required</h2>
          <p className="text-gray-400 text-sm mb-4">
            Virtual scouting requires a Scout or Studio subscription.
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            View Plans
          </button>
        </div>
      </div>
    )
  }

  // All checks pass — redirect to viewer with session param
  if (session) {
    const locationId = session.locationId || session.virtualTourId
    // Use navigate with replace so user doesn't get stuck in a redirect loop
    // when pressing back
    navigate(`/scout/${locationId}?session=${sessionId}`, { replace: true })
  }

  return null
}
