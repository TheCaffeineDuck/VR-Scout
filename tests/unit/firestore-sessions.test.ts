import { describe, it, expect, beforeEach } from 'vitest'
import {
  createSession,
  getSession,
  joinSession,
  leaveSession,
  listActiveSessions,
  endSession,
  deleteSession,
} from '@/lib/firestore/sessions'
import { localClear } from '@/lib/local-persistence'
import type { VRSession, Participant } from '@/types/session'

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    uid: 'user-1',
    displayName: 'Test User',
    avatarColor: '#FF0000',
    device: 'desktop',
    joinedAt: new Date(),
    ...overrides,
  }
}

function makeSessionInput(
  overrides: Partial<Omit<VRSession, 'id' | 'createdAt'>> = {}
): Omit<VRSession, 'id' | 'createdAt'> {
  return {
    locationId: 'loc-1',
    virtualTourId: 'tour-1',
    sessionType: 'collaborative',
    status: 'active',
    accessCode: 'ABC123',
    hostUid: 'host-user',
    participants: [makeParticipant({ uid: 'host-user', displayName: 'Host' })],
    virtualCameras: [],
    croquetSessionId: 'croquet-123',
    livekitRoomName: 'room-123',
    ...overrides,
  }
}

describe('firestore-sessions (local fallback)', () => {
  beforeEach(() => {
    localClear('vr_sessions')
  })

  describe('createSession', () => {
    it('should create a session with generated id and timestamp', async () => {
      const session = await createSession(makeSessionInput())

      expect(session.id).toBeDefined()
      expect(typeof session.id).toBe('string')
      expect(session.createdAt).toBeInstanceOf(Date)
      expect(session.status).toBe('active')
      expect(session.hostUid).toBe('host-user')
    })

    it('should store access code', async () => {
      const session = await createSession(makeSessionInput({ accessCode: 'XYZ789' }))
      const fetched = await getSession(session.id)

      expect(fetched!.accessCode).toBe('XYZ789')
    })

    it('should initialize with provided participants', async () => {
      const session = await createSession(makeSessionInput())
      const fetched = await getSession(session.id)

      expect(fetched!.participants).toHaveLength(1)
      expect(fetched!.participants[0].uid).toBe('host-user')
    })

    it('should store session type correctly', async () => {
      const solo = await createSession(makeSessionInput({ sessionType: 'solo' }))
      const collab = await createSession(makeSessionInput({ sessionType: 'collaborative' }))

      expect((await getSession(solo.id))!.sessionType).toBe('solo')
      expect((await getSession(collab.id))!.sessionType).toBe('collaborative')
    })

    it('should support null access code for public sessions', async () => {
      const session = await createSession(makeSessionInput({ accessCode: null }))
      const fetched = await getSession(session.id)

      expect(fetched!.accessCode).toBeNull()
    })
  })

  describe('getSession', () => {
    it('should return null for non-existent session', async () => {
      const result = await getSession('nonexistent')
      expect(result).toBeNull()
    })

    it('should round-trip all session fields', async () => {
      const session = await createSession(makeSessionInput())
      const fetched = await getSession(session.id)

      expect(fetched!.locationId).toBe('loc-1')
      expect(fetched!.virtualTourId).toBe('tour-1')
      expect(fetched!.croquetSessionId).toBe('croquet-123')
      expect(fetched!.livekitRoomName).toBe('room-123')
    })
  })

  describe('joinSession', () => {
    it('should add a participant to the session', async () => {
      const session = await createSession(makeSessionInput({ participants: [] }))
      const participant = makeParticipant({ uid: 'new-user', displayName: 'New User' })
      await joinSession(session.id, participant)

      const fetched = await getSession(session.id)
      expect(fetched!.participants).toHaveLength(1)
      expect(fetched!.participants[0].uid).toBe('new-user')
    })

    it('should not duplicate participant with same UID', async () => {
      const session = await createSession(makeSessionInput({ participants: [] }))
      const participant = makeParticipant({ uid: 'user-1' })

      await joinSession(session.id, participant)
      await joinSession(session.id, participant)

      const fetched = await getSession(session.id)
      expect(fetched!.participants).toHaveLength(1)
    })

    it('should support multiple different participants', async () => {
      const session = await createSession(makeSessionInput({ participants: [] }))
      await joinSession(session.id, makeParticipant({ uid: 'user-1', device: 'desktop' }))
      await joinSession(session.id, makeParticipant({ uid: 'user-2', device: 'quest3' }))
      await joinSession(session.id, makeParticipant({ uid: 'user-3', device: 'mobile' }))

      const fetched = await getSession(session.id)
      expect(fetched!.participants).toHaveLength(3)
    })

    it('should preserve participant device type', async () => {
      const session = await createSession(makeSessionInput({ participants: [] }))
      await joinSession(
        session.id,
        makeParticipant({ uid: 'vr-user', device: 'quest3', displayName: 'VR User' })
      )

      const fetched = await getSession(session.id)
      expect(fetched!.participants[0].device).toBe('quest3')
    })

    it('should preserve participant avatar color', async () => {
      const session = await createSession(makeSessionInput({ participants: [] }))
      await joinSession(
        session.id,
        makeParticipant({ uid: 'user-1', avatarColor: '#00FF00' })
      )

      const fetched = await getSession(session.id)
      expect(fetched!.participants[0].avatarColor).toBe('#00FF00')
    })
  })

  describe('leaveSession', () => {
    it('should remove a participant by UID', async () => {
      const session = await createSession(
        makeSessionInput({
          participants: [
            makeParticipant({ uid: 'user-1' }),
            makeParticipant({ uid: 'user-2' }),
          ],
        })
      )

      await leaveSession(session.id, 'user-1')
      const fetched = await getSession(session.id)
      expect(fetched!.participants).toHaveLength(1)
      expect(fetched!.participants[0].uid).toBe('user-2')
    })

    it('should auto-end session when host leaves', async () => {
      const session = await createSession(
        makeSessionInput({
          hostUid: 'host-user',
          participants: [
            makeParticipant({ uid: 'host-user' }),
            makeParticipant({ uid: 'user-2' }),
          ],
        })
      )

      await leaveSession(session.id, 'host-user')
      const fetched = await getSession(session.id)
      expect(fetched!.status).toBe('ended')
    })

    it('should auto-end session when last participant leaves', async () => {
      const session = await createSession(
        makeSessionInput({
          hostUid: 'host-user',
          participants: [makeParticipant({ uid: 'only-user' })],
        })
      )

      await leaveSession(session.id, 'only-user')
      const fetched = await getSession(session.id)
      expect(fetched!.status).toBe('ended')
    })

    it('should not end session when non-host participant leaves and others remain', async () => {
      const session = await createSession(
        makeSessionInput({
          hostUid: 'host-user',
          participants: [
            makeParticipant({ uid: 'host-user' }),
            makeParticipant({ uid: 'user-2' }),
          ],
        })
      )

      await leaveSession(session.id, 'user-2')
      const fetched = await getSession(session.id)
      expect(fetched!.status).toBe('active')
      expect(fetched!.participants).toHaveLength(1)
    })

    it('should handle leaving non-existent session gracefully', async () => {
      await expect(leaveSession('nonexistent', 'user-1')).resolves.toBeUndefined()
    })
  })

  describe('listActiveSessions', () => {
    it('should return only active sessions', async () => {
      const s1 = await createSession(makeSessionInput({ status: 'active' }))
      const s2 = await createSession(makeSessionInput({ status: 'ended' }))
      const s3 = await createSession(makeSessionInput({ status: 'active' }))

      const active = await listActiveSessions()
      expect(active).toHaveLength(2)
      active.forEach((s) => expect(s.status).toBe('active'))
    })

    it('should return empty array when no active sessions exist', async () => {
      await createSession(makeSessionInput({ status: 'ended' }))
      const active = await listActiveSessions()
      expect(active).toEqual([])
    })

    it('should sort by createdAt descending', async () => {
      await createSession(makeSessionInput({ locationId: 'first' }))
      await new Promise((r) => setTimeout(r, 10))
      await createSession(makeSessionInput({ locationId: 'second' }))

      const active = await listActiveSessions()
      expect(active[0].locationId).toBe('second')
      expect(active[1].locationId).toBe('first')
    })
  })

  describe('endSession', () => {
    it('should set session status to ended', async () => {
      const session = await createSession(makeSessionInput())
      await endSession(session.id)

      const fetched = await getSession(session.id)
      expect(fetched!.status).toBe('ended')
    })

    it('should not throw when ending non-existent session', async () => {
      await expect(endSession('nonexistent')).resolves.toBeUndefined()
    })
  })

  describe('deleteSession', () => {
    it('should remove a session completely', async () => {
      const session = await createSession(makeSessionInput())
      await deleteSession(session.id)

      const fetched = await getSession(session.id)
      expect(fetched).toBeNull()
    })

    it('should not affect other sessions', async () => {
      const s1 = await createSession(makeSessionInput({ locationId: 'loc-1' }))
      const s2 = await createSession(makeSessionInput({ locationId: 'loc-2' }))
      await deleteSession(s1.id)

      expect(await getSession(s1.id)).toBeNull()
      expect(await getSession(s2.id)).not.toBeNull()
    })
  })
})
