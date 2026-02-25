import { create } from 'zustand'

export interface RemoteParticipantState {
  displayName: string
  avatarColor: string
  device: string
  position: [number, number, number]
  rotation: [number, number, number]
  activeTool: string
  laserTarget: [number, number, number] | null
  isSpeaking: boolean
}

interface ParticipantPresenceState {
  remoteParticipants: Record<string, RemoteParticipantState>

  setRemoteParticipant: (uid: string, state: RemoteParticipantState) => void
  updateRemoteParticipant: (uid: string, updates: Partial<RemoteParticipantState>) => void
  removeRemoteParticipant: (uid: string) => void
  clearRemoteParticipants: () => void
}

export const useParticipantPresenceStore = create<ParticipantPresenceState>((set) => ({
  remoteParticipants: {},

  setRemoteParticipant: (uid, state) =>
    set((s) => ({
      remoteParticipants: { ...s.remoteParticipants, [uid]: state },
    })),

  updateRemoteParticipant: (uid, updates) =>
    set((s) => {
      const existing = s.remoteParticipants[uid]
      if (!existing) return s
      return {
        remoteParticipants: {
          ...s.remoteParticipants,
          [uid]: { ...existing, ...updates },
        },
      }
    }),

  removeRemoteParticipant: (uid) =>
    set((s) => {
      const { [uid]: _, ...rest } = s.remoteParticipants
      return { remoteParticipants: rest }
    }),

  clearRemoteParticipants: () => set({ remoteParticipants: {} }),
}))
