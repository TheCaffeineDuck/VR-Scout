import { create } from 'zustand'
import type { VRSession, Participant } from '@/types/session'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface SessionStoreState {
  currentSession: VRSession | null
  participants: Participant[]
  isCollaborative: boolean
  connectionStatus: ConnectionStatus

  setCurrentSession: (session: VRSession | null) => void
  setParticipants: (participants: Participant[]) => void
  addParticipant: (participant: Participant) => void
  removeParticipant: (uid: string) => void
  setIsCollaborative: (collaborative: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  currentSession: null,
  participants: [],
  isCollaborative: false,
  connectionStatus: 'disconnected',

  setCurrentSession: (session) => set({ currentSession: session }),
  setParticipants: (participants) => set({ participants }),
  addParticipant: (participant) =>
    set((state) => ({ participants: [...state.participants, participant] })),
  removeParticipant: (uid) =>
    set((state) => ({ participants: state.participants.filter((p) => p.uid !== uid) })),
  setIsCollaborative: (collaborative) => set({ isCollaborative: collaborative }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
}))
