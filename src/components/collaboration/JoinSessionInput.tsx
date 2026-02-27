import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSessionByAccessCode } from '@/lib/firestore/sessions'

interface JoinSessionInputProps {
  /** If true, renders inline (no navigate — use onJoin callback instead) */
  inline?: boolean
  onJoin?: (locationId: string, sessionId: string) => void
  onClose?: () => void
}

export function JoinSessionInput({ inline, onJoin, onClose }: JoinSessionInputProps) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Auto-uppercase, strip non-alphanumeric, max 6 chars
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setCode(raw)
    setError(null)
  }, [])

  const handleSubmit = useCallback(async () => {
    const normalized = code.replace(/\s/g, '').toUpperCase()
    if (normalized.length !== 6) {
      setError('Code must be 6 characters')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const session = await getSessionByAccessCode(normalized)
      if (!session) {
        setError('No active session with that code')
        setLoading(false)
        return
      }

      const locationId = session.locationId || session.virtualTourId
      if (onJoin) {
        onJoin(locationId, session.id)
      } else {
        navigate(`/scout/${locationId}?session=${session.id}`)
      }
    } catch {
      setError('Failed to look up session')
    } finally {
      setLoading(false)
    }
  }, [code, navigate, onJoin])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && code.length === 6) {
        handleSubmit()
      }
    },
    [code, handleSubmit],
  )

  return (
    <div className={inline ? '' : 'space-y-2'}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          placeholder="ABC123"
          maxLength={6}
          className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono text-center tracking-widest placeholder-gray-600 focus:outline-none focus:border-indigo-500 uppercase"
          aria-label="Session code"
          autoFocus={!inline}
        />
        <button
          onClick={handleSubmit}
          disabled={code.length !== 6 || loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          {loading ? 'Joining...' : 'Join'}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-sm leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        )}
      </div>
      {error && (
        <p className="text-red-400 text-[11px] mt-1">{error}</p>
      )}
    </div>
  )
}
