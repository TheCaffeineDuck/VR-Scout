import { useState, useCallback } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { useCollaboration } from '@/hooks/useCollaboration'
import { endSession as endSessionFirestore } from '@/lib/firestore/sessions'
import { ParticipantListPanel } from './ParticipantListPanel'

interface SessionSharePanelProps {
  onClose: () => void
}

export function SessionSharePanel({ onClose }: SessionSharePanelProps) {
  const currentSession = useSessionStore((s) => s.currentSession)
  const participants = useSessionStore((s) => s.participants)
  const { leaveSession, localUid } = useCollaboration()

  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [ending, setEnding] = useState(false)

  const isHost = currentSession?.hostUid === localUid

  const sessionUrl = currentSession
    ? `${window.location.origin}/session/${currentSession.id}`
    : ''

  const accessCode = currentSession?.accessCode ?? ''

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sessionUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // Fallback for insecure contexts
      const input = document.createElement('input')
      input.value = sessionUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }, [sessionUrl])

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accessCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }, [accessCode])

  const handleEndSession = useCallback(async () => {
    if (!currentSession) return
    setEnding(true)
    try {
      await endSessionFirestore(currentSession.id)
    } catch {
      // Best-effort
    }
    leaveSession()
    window.dispatchEvent(
      new CustomEvent('session-ended', { detail: { reason: 'host' } }),
    )
    onClose()
  }, [currentSession, leaveSession, onClose])

  const handleLeaveSession = useCallback(() => {
    leaveSession()
    onClose()
  }, [leaveSession, onClose])

  if (!currentSession) return null

  return (
    <div className="fixed top-14 left-4 z-50 w-80 bg-gray-900/95 rounded-xl border border-gray-700 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h3 className="text-sm font-semibold text-white">Session Active</h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-lg leading-none"
          aria-label="Close session panel"
        >
          &times;
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Host badge */}
        {isHost && (
          <span className="inline-block text-[10px] bg-indigo-600/30 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full">
            You are the host
          </span>
        )}

        {/* Share Link */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
            Share Link
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono truncate">
              /session/{currentSession.id.slice(0, 12)}...
            </div>
            <button
              onClick={copyLink}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                copiedLink
                  ? 'bg-green-600/20 text-green-400 border border-green-700/50'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              {copiedLink ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Session Code */}
        {accessCode && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
              Session Code
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex justify-center gap-1.5">
                {accessCode.split('').map((char, i) => (
                  <span
                    key={i}
                    className="bg-gray-800 border border-gray-700 rounded-md w-8 h-9 flex items-center justify-center text-lg font-mono font-bold text-white"
                  >
                    {char}
                  </span>
                ))}
              </div>
              <button
                onClick={copyCode}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  copiedCode
                    ? 'bg-green-600/20 text-green-400 border border-green-700/50'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {copiedCode ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Participant count */}
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-gray-400">Participants</span>
          <span className="text-xs font-semibold text-white">
            {participants.length}
          </span>
        </div>

        {/* Participant list */}
        <ParticipantListPanel hostUid={currentSession.hostUid} compact />

        {/* Divider */}
        <div className="border-t border-gray-700/50" />

        {/* Actions */}
        {isHost ? (
          <button
            onClick={handleEndSession}
            disabled={ending}
            className="w-full py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            {ending ? 'Ending...' : 'End Session'}
          </button>
        ) : (
          <button
            onClick={handleLeaveSession}
            className="w-full py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded-lg transition-colors"
          >
            Leave Session
          </button>
        )}
      </div>
    </div>
  )
}
