import { useState, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { AuthContext } from '@/hooks/useAuthContext'
import { isFirebaseAvailable } from '@/lib/firebase'

interface AuthGateProps {
  children: ReactNode
}

type AuthMode = 'signin' | 'signup' | 'guest'

export function AuthGate({ children }: AuthGateProps) {
  const {
    user,
    loading,
    error,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInAsGuest,
    signOut,
    clearError,
  } = useAuth()

  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Show children once authenticated
  if (user) {
    return (
      <AuthContext.Provider value={{ user, signOut }}>
        {children}
      </AuthContext.Provider>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  const hasFirebase = isFirebaseAvailable()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    clearError()
    try {
      if (mode === 'guest') {
        await signInAsGuest(displayName || 'Guest')
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName)
      } else {
        await signInWithEmail(email, password)
      }
    } catch {
      // error is set in hook
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-[9999]">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <h1 className="text-xl font-bold text-white mb-1 text-center">
          VR Scout
        </h1>
        <p className="text-gray-400 text-xs text-center mb-5">
          Virtual Location Scouting
        </p>

        {!hasFirebase && (
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-2.5 mb-4 text-xs text-amber-300">
            Running in local mode. Data stored in browser only.
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-2.5 mb-4 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'guest' ? (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
            </div>
          ) : (
            <>
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-sm transition-colors"
          >
            {submitting
              ? 'Please wait...'
              : mode === 'guest'
                ? 'Continue as Guest'
                : mode === 'signup'
                  ? 'Create Account'
                  : 'Sign In'}
          </button>
        </form>

        {hasFirebase && mode === 'signin' && (
          <button
            onClick={async () => {
              setSubmitting(true)
              clearError()
              try {
                await signInWithGoogle()
              } catch {
                // error set in hook
              } finally {
                setSubmitting(false)
              }
            }}
            disabled={submitting}
            className="w-full mt-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 text-white py-2 rounded-lg font-medium text-sm border border-gray-600 transition-colors"
          >
            Sign in with Google
          </button>
        )}

        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-gray-500">
          {mode !== 'signin' && (
            <button
              onClick={() => { setMode('signin'); clearError() }}
              className="hover:text-gray-300 transition-colors"
            >
              Sign In
            </button>
          )}
          {mode !== 'signup' && (
            <button
              onClick={() => { setMode('signup'); clearError() }}
              className="hover:text-gray-300 transition-colors"
            >
              Create Account
            </button>
          )}
          {mode !== 'guest' && (
            <button
              onClick={() => { setMode('guest'); clearError() }}
              className="hover:text-gray-300 transition-colors"
            >
              Guest Mode
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
