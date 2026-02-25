import { useEffect, useCallback } from 'react'
import { useVoiceChatStore, connectVoiceChat, disconnectVoiceChat } from '@/hooks/useVoiceChat'
import { useSessionStore } from '@/stores/session-store'

export function VoiceChatControls() {
  const currentSession = useSessionStore((s) => s.currentSession)
  const isCollaborative = useSessionStore((s) => s.isCollaborative)
  const {
    isConnected,
    isAvailable,
    mode,
    isMuted,
    isSpeaking,
    volume,
    setMode,
    setMuted,
    setSpeaking,
    setVolume,
  } = useVoiceChatStore()

  // Auto-connect voice when joining a collaborative session
  useEffect(() => {
    if (isCollaborative && currentSession && isAvailable && !isConnected) {
      connectVoiceChat(
        currentSession.livekitRoomName,
        currentSession.participants[0]?.displayName ?? 'User',
      )
    }
    return () => {
      if (isConnected) {
        disconnectVoiceChat()
      }
    }
  }, [isCollaborative, currentSession, isAvailable, isConnected])

  // Push-to-talk keyboard handler (V key)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'KeyV' && mode === 'push-to-talk' && !isMuted && isConnected) {
        setSpeaking(true)
      }
    },
    [mode, isMuted, isConnected, setSpeaking],
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'KeyV' && mode === 'push-to-talk') {
        setSpeaking(false)
      }
    },
    [mode, setSpeaking],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  // Don't render if not in a collaborative session
  if (!isCollaborative || !currentSession) return null

  return (
    <div className="fixed bottom-20 left-4 z-40 bg-gray-900/90 rounded-lg border border-gray-700 p-2.5 w-48">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] uppercase tracking-wider text-gray-500">Voice</h4>
        {!isAvailable && (
          <span className="text-[9px] text-yellow-500">unavailable</span>
        )}
        {isAvailable && (
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setMode('push-to-talk')}
          className={`flex-1 text-[10px] py-1 rounded transition-colors ${
            mode === 'push-to-talk'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Push to Talk
        </button>
        <button
          onClick={() => setMode('open-mic')}
          className={`flex-1 text-[10px] py-1 rounded transition-colors ${
            mode === 'open-mic'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Open Mic
        </button>
      </div>

      {/* Mute button */}
      <button
        onClick={() => setMuted(!isMuted)}
        className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-colors mb-2 ${
          isMuted
            ? 'bg-red-600/30 text-red-400 border border-red-800'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
      >
        <span>{isMuted ? '🔇' : '🎤'}</span>
        <span>{isMuted ? 'Muted' : 'Unmuted'}</span>
      </button>

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="flex items-center gap-1.5 mb-2 p-1 rounded bg-green-900/30 border border-green-800/50">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-green-400">Speaking...</span>
        </div>
      )}

      {/* Volume slider */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500">Vol</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-indigo-500"
        />
        <span className="text-[10px] text-gray-400 w-6 text-right">
          {Math.round(volume * 100)}
        </span>
      </div>

      {/* Keyboard shortcut hint */}
      {mode === 'push-to-talk' && (
        <p className="text-[9px] text-gray-600 mt-1.5 text-center">
          Hold V to talk
        </p>
      )}
    </div>
  )
}
