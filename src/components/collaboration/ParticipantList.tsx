import { useSessionStore } from '@/stores/session-store'
import { useParticipantPresenceStore } from '@/stores/participant-store'

const DEVICE_ICONS: Record<string, string> = {
  quest3: 'VR',
  vision_pro: 'VP',
  desktop: 'PC',
  mobile: 'MB',
}

export function ParticipantList() {
  const participants = useSessionStore((s) => s.participants)
  const currentSession = useSessionStore((s) => s.currentSession)
  const remoteParticipants = useParticipantPresenceStore((s) => s.remoteParticipants)

  if (!currentSession || participants.length <= 1) return null

  return (
    <div className="fixed top-14 left-4 z-40 w-56 bg-gray-900/90 rounded-lg border border-gray-700 p-3">
      <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
        Participants ({participants.length})
      </h4>
      <div className="space-y-1.5">
        {participants.map((p) => {
          const remote = remoteParticipants[p.uid]
          const isSpeaking = remote?.isSpeaking ?? false
          const isHost = p.uid === currentSession.hostUid

          return (
            <div key={p.uid} className="flex items-center gap-2">
              {/* Avatar color dot + speaking ring */}
              <div className="relative flex-shrink-0">
                <span
                  className="block w-3 h-3 rounded-full"
                  style={{ backgroundColor: p.avatarColor }}
                />
                {isSpeaking && (
                  <span className="absolute -inset-0.5 rounded-full border border-green-400 animate-pulse" />
                )}
              </div>

              {/* Name */}
              <span className="text-xs text-gray-300 truncate flex-1">
                {p.displayName}
                {isHost && (
                  <span className="ml-1 text-[9px] text-yellow-500">(host)</span>
                )}
              </span>

              {/* Device badge */}
              <span className="text-[9px] text-gray-500 bg-gray-800 rounded px-1 py-0.5">
                {DEVICE_ICONS[p.device] ?? p.device}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
