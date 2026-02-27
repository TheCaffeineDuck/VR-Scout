import { useSessionStore } from '@/stores/session-store'
import { useVoiceChatStore } from '@/hooks/useVoiceChat'

const DEVICE_ICONS: Record<string, string> = {
  quest3: '\uD83E\uDD7D',      // goggles
  vision_pro: '\uD83D\uDC41',  // eye
  desktop: '\uD83D\uDCBB',     // laptop
  mobile: '\uD83D\uDCF1',      // phone
}

interface ParticipantListPanelProps {
  hostUid: string
  compact?: boolean
}

export function ParticipantListPanel({
  hostUid,
  compact = false,
}: ParticipantListPanelProps) {
  const participants = useSessionStore((s) => s.participants)
  const speakingStates = useVoiceChatStore((s) => s.speakingStates)

  if (participants.length === 0) return null

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {participants.map((p) => {
        const isSpeaking = speakingStates[p.uid] ?? false
        const isHost = p.uid === hostUid

        return (
          <div
            key={p.uid}
            className={`flex items-center gap-2 ${
              compact ? 'py-0.5' : 'py-1 px-2 rounded-lg bg-gray-800/50'
            }`}
          >
            {/* Avatar color dot */}
            <span
              className={`w-3 h-3 rounded-full flex-shrink-0 ${
                isSpeaking ? 'ring-2 ring-green-400 ring-offset-1 ring-offset-gray-900' : ''
              }`}
              style={{ backgroundColor: p.avatarColor }}
            />

            {/* Name */}
            <span className="text-xs text-gray-300 truncate flex-1">
              {p.displayName}
              {isHost && (
                <span className="ml-1.5 text-[9px] bg-indigo-600/30 text-indigo-300 px-1 py-0.5 rounded">
                  Host
                </span>
              )}
            </span>

            {/* Device icon */}
            <span
              className="text-[10px] flex-shrink-0"
              title={p.device}
              aria-label={`${p.device} device`}
            >
              {DEVICE_ICONS[p.device] ?? DEVICE_ICONS.desktop}
            </span>

            {/* Mute indicator */}
            <span
              className={`text-[10px] flex-shrink-0 ${
                isSpeaking ? 'text-green-400' : 'text-gray-600'
              }`}
              aria-label={isSpeaking ? 'Speaking' : 'Not speaking'}
            >
              {isSpeaking ? '\uD83C\uDF99' : '\uD83C\uDF99'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
