import { useState } from 'react'
import { useCollaboration } from '@/hooks/useCollaboration'

type View = 'idle' | 'create' | 'join'

export function SessionManager() {
  const {
    currentSession,
    connectionStatus,
    isCollaborative,
    isAvailable,
    participants,
    createSession,
    joinSession,
    leaveSession,
  } = useCollaboration()

  const [view, setView] = useState<View>('idle')
  const [displayName, setDisplayName] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [showPanel, setShowPanel] = useState(false)

  const handleCreate = async () => {
    if (!displayName.trim()) return
    await createSession(displayName.trim(), sessionName.trim() || undefined)
    setView('idle')
  }

  const handleJoin = async () => {
    if (!displayName.trim() || !sessionName.trim()) return
    await joinSession(displayName.trim(), sessionName.trim(), accessCode || undefined)
    setView('idle')
  }

  const handleLeave = () => {
    leaveSession()
    setView('idle')
  }

  // Status indicator chip (always visible)
  const statusColor =
    connectionStatus === 'connected'
      ? 'bg-green-500'
      : connectionStatus === 'connecting'
        ? 'bg-yellow-500 animate-pulse'
        : connectionStatus === 'error'
          ? 'bg-red-500'
          : 'bg-gray-500'

  return (
    <>
      {/* Floating status chip */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="fixed top-4 left-4 z-50 flex items-center gap-2 bg-gray-900/90 rounded-lg px-3 py-1.5 border border-gray-700 hover:border-gray-500 transition-colors"
        title="Collaboration"
      >
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-xs text-gray-300">
          {currentSession
            ? isCollaborative
              ? `${participants.length} user${participants.length !== 1 ? 's' : ''}`
              : 'Solo'
            : 'Offline'}
        </span>
        {!isAvailable && connectionStatus === 'disconnected' && (
          <span className="text-[9px] text-gray-500 ml-1">(local only)</span>
        )}
      </button>

      {/* Session panel */}
      {showPanel && (
        <div className="fixed top-14 left-4 z-50 w-72 bg-gray-900/95 rounded-xl border border-gray-700 shadow-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Collaboration</h3>
            <button
              onClick={() => setShowPanel(false)}
              className="text-gray-500 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>

          {!isAvailable && (
            <div className="mb-3 p-2 rounded bg-yellow-900/30 border border-yellow-800/50">
              <p className="text-[10px] text-yellow-400">
                Collaboration unavailable — Croquet API keys not configured. Running in local-only
                mode.
              </p>
            </div>
          )}

          {/* Active session info */}
          {currentSession ? (
            <div className="space-y-3">
              <div className="p-2 rounded bg-gray-800/50 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Session</span>
                  <span className="text-[10px] text-gray-300 font-mono">
                    {currentSession.id.slice(0, 12)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Type</span>
                  <span className="text-[10px] text-gray-300">
                    {currentSession.sessionType === 'collaborative' ? 'Collaborative' : 'Solo'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Status</span>
                  <span className={`text-[10px] ${statusColor === 'bg-green-500' ? 'text-green-400' : 'text-gray-300'}`}>
                    {connectionStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Participants</span>
                  <span className="text-[10px] text-gray-300">{participants.length}</span>
                </div>
              </div>

              {/* Participant list */}
              <div className="space-y-1">
                {participants.map((p) => (
                  <div key={p.uid} className="flex items-center gap-2 text-xs text-gray-300">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.avatarColor }}
                    />
                    <span className="truncate">{p.displayName}</span>
                    <span className="text-[9px] text-gray-500 ml-auto">{p.device}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleLeave}
                className="w-full py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded-lg transition-colors"
              >
                Leave Session
              </button>
            </div>
          ) : (
            <>
              {/* Create / Join views */}
              {view === 'idle' && (
                <div className="space-y-2">
                  <button
                    onClick={() => setView('create')}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-colors"
                  >
                    Create Session
                  </button>
                  <button
                    onClick={() => setView('join')}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors"
                  >
                    Join Session
                  </button>
                </div>
              )}

              {view === 'create' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="Session name (optional)"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setView('idle')}
                      className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={!displayName.trim()}
                      className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs rounded-lg"
                    >
                      Create
                    </button>
                  </div>
                </div>
              )}

              {view === 'join' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="Session ID"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Access code (optional)"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setView('idle')}
                      className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleJoin}
                      disabled={!displayName.trim() || !sessionName.trim()}
                      className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs rounded-lg"
                    >
                      Join
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
