import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore, type ConnectionStatus } from '@/stores/session-store'
import type { VRSession, Participant } from '@/types/session'

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    uid: 'user-1',
    displayName: 'Test User',
    avatarColor: '#FF0000',
    device: 'desktop',
    joinedAt: new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  }
}

function makeSession(overrides: Partial<VRSession> = {}): VRSession {
  return {
    id: 'session-1',
    locationId: 'loc-1',
    virtualTourId: 'tour-1',
    sessionType: 'collaborative',
    status: 'active',
    accessCode: 'ABC123',
    hostUid: 'host-user',
    participants: [],
    virtualCameras: [],
    croquetSessionId: 'croquet-123',
    livekitRoomName: 'room-123',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  }
}

describe('session-store', () => {
  beforeEach(() => {
    useSessionStore.setState({
      currentSession: null,
      participants: [],
      isCollaborative: false,
      connectionStatus: 'disconnected',
      collaborationSession: null,
    })
  })

  describe('setCurrentSession', () => {
    it('should set the current session', () => {
      const session = makeSession()
      useSessionStore.getState().setCurrentSession(session)

      expect(useSessionStore.getState().currentSession).toEqual(session)
    })

    it('should clear the session with null', () => {
      useSessionStore.getState().setCurrentSession(makeSession())
      useSessionStore.getState().setCurrentSession(null)

      expect(useSessionStore.getState().currentSession).toBeNull()
    })

    it('should preserve all session fields', () => {
      const session = makeSession({
        accessCode: 'XYZ',
        hostUid: 'my-uid',
        sessionType: 'solo',
      })
      useSessionStore.getState().setCurrentSession(session)

      const stored = useSessionStore.getState().currentSession!
      expect(stored.accessCode).toBe('XYZ')
      expect(stored.hostUid).toBe('my-uid')
      expect(stored.sessionType).toBe('solo')
    })
  })

  describe('addParticipant', () => {
    it('should add a participant to the list', () => {
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-1' }))

      const { participants } = useSessionStore.getState()
      expect(participants).toHaveLength(1)
      expect(participants[0].uid).toBe('user-1')
    })

    it('should accumulate multiple participants', () => {
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-1' }))
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-2' }))
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-3' }))

      expect(useSessionStore.getState().participants).toHaveLength(3)
    })

    it('should append duplicate UID (store does not deduplicate)', () => {
      // Note: The session store's addParticipant does a simple append.
      // Deduplication is handled at the Firestore layer (joinSession).
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-1' }))
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-1' }))

      expect(useSessionStore.getState().participants).toHaveLength(2)
    })

    it('should preserve participant device type', () => {
      useSessionStore.getState().addParticipant(makeParticipant({ device: 'quest3' }))

      expect(useSessionStore.getState().participants[0].device).toBe('quest3')
    })

    it('should preserve participant avatar color', () => {
      useSessionStore.getState().addParticipant(makeParticipant({ avatarColor: '#00FF00' }))

      expect(useSessionStore.getState().participants[0].avatarColor).toBe('#00FF00')
    })
  })

  describe('removeParticipant', () => {
    it('should remove a participant by UID', () => {
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-1' }))
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-2' }))

      useSessionStore.getState().removeParticipant('user-1')

      const { participants } = useSessionStore.getState()
      expect(participants).toHaveLength(1)
      expect(participants[0].uid).toBe('user-2')
    })

    it('should handle removing non-existent UID gracefully', () => {
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-1' }))
      useSessionStore.getState().removeParticipant('nonexistent')

      expect(useSessionStore.getState().participants).toHaveLength(1)
    })

    it('should remove all participants with matching UID', () => {
      // If duplicates exist, filter removes all
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-1' }))
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-1' }))
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'user-2' }))

      useSessionStore.getState().removeParticipant('user-1')
      expect(useSessionStore.getState().participants).toHaveLength(1)
      expect(useSessionStore.getState().participants[0].uid).toBe('user-2')
    })
  })

  describe('setParticipants', () => {
    it('should replace the entire participants list', () => {
      useSessionStore.getState().addParticipant(makeParticipant({ uid: 'old' }))

      useSessionStore.getState().setParticipants([
        makeParticipant({ uid: 'new-1' }),
        makeParticipant({ uid: 'new-2' }),
      ])

      const { participants } = useSessionStore.getState()
      expect(participants).toHaveLength(2)
      expect(participants[0].uid).toBe('new-1')
    })

    it('should allow setting empty participants list', () => {
      useSessionStore.getState().addParticipant(makeParticipant())
      useSessionStore.getState().setParticipants([])

      expect(useSessionStore.getState().participants).toEqual([])
    })
  })

  describe('setConnectionStatus', () => {
    it('should update connection status', () => {
      const statuses: ConnectionStatus[] = ['disconnected', 'connecting', 'connected', 'error']

      for (const status of statuses) {
        useSessionStore.getState().setConnectionStatus(status)
        expect(useSessionStore.getState().connectionStatus).toBe(status)
      }
    })
  })

  describe('setIsCollaborative', () => {
    it('should toggle collaborative mode', () => {
      useSessionStore.getState().setIsCollaborative(true)
      expect(useSessionStore.getState().isCollaborative).toBe(true)

      useSessionStore.getState().setIsCollaborative(false)
      expect(useSessionStore.getState().isCollaborative).toBe(false)
    })
  })

  describe('setCollaborationSession', () => {
    it('should store a collaboration session reference', () => {
      const mockSession = { id: 'mock-collab' } as any
      useSessionStore.getState().setCollaborationSession(mockSession)

      expect(useSessionStore.getState().collaborationSession).toBe(mockSession)
    })

    it('should clear with null', () => {
      useSessionStore.getState().setCollaborationSession({ id: 'mock' } as any)
      useSessionStore.getState().setCollaborationSession(null)

      expect(useSessionStore.getState().collaborationSession).toBeNull()
    })
  })

  describe('initial state', () => {
    it('should start with null session', () => {
      expect(useSessionStore.getState().currentSession).toBeNull()
    })

    it('should start with empty participants', () => {
      expect(useSessionStore.getState().participants).toEqual([])
    })

    it('should start disconnected', () => {
      expect(useSessionStore.getState().connectionStatus).toBe('disconnected')
    })

    it('should start as non-collaborative', () => {
      expect(useSessionStore.getState().isCollaborative).toBe(false)
    })
  })
})
