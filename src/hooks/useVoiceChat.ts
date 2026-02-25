import { create } from 'zustand'
import { isLiveKitConfigured } from '@/lib/collaboration'

export type VoiceMode = 'push-to-talk' | 'open-mic'

interface VoiceChatState {
  isConnected: boolean
  isAvailable: boolean
  mode: VoiceMode
  isMuted: boolean
  isSpeaking: boolean
  volume: number
  // Per-participant speaking states keyed by uid
  speakingStates: Record<string, boolean>

  setConnected: (connected: boolean) => void
  setMode: (mode: VoiceMode) => void
  setMuted: (muted: boolean) => void
  setSpeaking: (speaking: boolean) => void
  setVolume: (volume: number) => void
  setSpeakingState: (uid: string, speaking: boolean) => void
  clearSpeakingStates: () => void
}

export const useVoiceChatStore = create<VoiceChatState>((set) => ({
  isConnected: false,
  isAvailable: isLiveKitConfigured(),
  mode: 'push-to-talk',
  isMuted: false,
  isSpeaking: false,
  volume: 0.8,
  speakingStates: {},

  setConnected: (connected) => set({ isConnected: connected }),
  setMode: (mode) => set({ mode }),
  setMuted: (muted) => set({ isMuted: muted }),
  setSpeaking: (speaking) => set({ isSpeaking: speaking }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  setSpeakingState: (uid, speaking) =>
    set((s) => ({
      speakingStates: { ...s.speakingStates, [uid]: speaking },
    })),
  clearSpeakingStates: () => set({ speakingStates: {} }),
}))

// ---- Voice chat connection (stub) ----

let audioContext: AudioContext | null = null

export async function connectVoiceChat(roomName: string, _participantName: string): Promise<boolean> {
  if (!isLiveKitConfigured()) {
    console.warn('[VoiceChat] LiveKit not configured — voice chat unavailable')
    return false
  }

  // TODO: Replace with real LiveKit SDK connection
  // import { Room, RoomEvent } from 'livekit-client'
  // const room = new Room()
  // await room.connect(import.meta.env.VITE_LIVEKIT_URL, token)

  console.log(`[VoiceChat] Would connect to LiveKit room: ${roomName}`)

  // Create AudioContext for spatial audio processing
  if (!audioContext) {
    audioContext = new AudioContext()
  }

  useVoiceChatStore.getState().setConnected(true)
  return true
}

export function disconnectVoiceChat() {
  useVoiceChatStore.getState().setConnected(false)
  useVoiceChatStore.getState().clearSpeakingStates()

  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
}

/**
 * Update the spatial position of a remote participant's audio source.
 * In a real implementation this would update the PannerNode position
 * on the Web Audio API spatialization graph.
 */
export function updateParticipantAudioPosition(
  _uid: string,
  _position: [number, number, number],
) {
  // TODO: With real LiveKit integration:
  // 1. Get the AudioTrack for this participant
  // 2. Route it through a PannerNode
  // 3. Update PannerNode.positionX/Y/Z to match 3D position
}

/**
 * Update the listener (local user) position for spatial audio.
 */
export function updateListenerPosition(
  _position: [number, number, number],
  _forward: [number, number, number],
  _up: [number, number, number],
) {
  if (!audioContext) return

  // TODO: With real implementation:
  // audioContext.listener.positionX.value = position[0]
  // audioContext.listener.positionY.value = position[1]
  // audioContext.listener.positionZ.value = position[2]
  // audioContext.listener.forwardX.value = forward[0]
  // etc.
}
