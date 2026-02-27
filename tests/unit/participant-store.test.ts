import { describe, it, expect, beforeEach } from 'vitest'
import {
  useParticipantPresenceStore,
  type RemoteParticipantState,
} from '@/stores/participant-store'

function makeParticipantState(
  overrides: Partial<RemoteParticipantState> = {}
): RemoteParticipantState {
  return {
    displayName: 'Remote User',
    avatarColor: '#FF0000',
    device: 'desktop',
    position: [0, 1.6, 0],
    rotation: [0, 0, 0],
    activeTool: 'navigate',
    laserTarget: null,
    isSpeaking: false,
    ...overrides,
  }
}

describe('participant-store', () => {
  beforeEach(() => {
    useParticipantPresenceStore.setState({ remoteParticipants: {} })
  })

  describe('setRemoteParticipant', () => {
    it('should add a new remote participant', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState())

      const { remoteParticipants } = useParticipantPresenceStore.getState()
      expect(remoteParticipants['user-1']).toBeDefined()
      expect(remoteParticipants['user-1'].displayName).toBe('Remote User')
    })

    it('should replace an existing participant fully', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState({ displayName: 'First' }))
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState({ displayName: 'Second' }))

      expect(
        useParticipantPresenceStore.getState().remoteParticipants['user-1'].displayName
      ).toBe('Second')
    })

    it('should store position and rotation', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant(
          'user-1',
          makeParticipantState({ position: [5, 2, -3], rotation: [10, 90, 0] })
        )

      const p = useParticipantPresenceStore.getState().remoteParticipants['user-1']
      expect(p.position).toEqual([5, 2, -3])
      expect(p.rotation).toEqual([10, 90, 0])
    })

    it('should support multiple remote participants', () => {
      const store = useParticipantPresenceStore.getState()
      store.setRemoteParticipant('user-1', makeParticipantState({ displayName: 'User 1' }))
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-2', makeParticipantState({ displayName: 'User 2' }))
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-3', makeParticipantState({ displayName: 'User 3' }))

      const { remoteParticipants } = useParticipantPresenceStore.getState()
      expect(Object.keys(remoteParticipants)).toHaveLength(3)
    })

    it('should store device type', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState({ device: 'quest3' }))

      expect(
        useParticipantPresenceStore.getState().remoteParticipants['user-1'].device
      ).toBe('quest3')
    })
  })

  describe('updateRemoteParticipant', () => {
    it('should merge updates into existing participant', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState())
      useParticipantPresenceStore
        .getState()
        .updateRemoteParticipant('user-1', { position: [10, 1.6, 5] })

      const p = useParticipantPresenceStore.getState().remoteParticipants['user-1']
      expect(p.position).toEqual([10, 1.6, 5])
      expect(p.displayName).toBe('Remote User') // unchanged
    })

    it('should update speaking state', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState())
      useParticipantPresenceStore
        .getState()
        .updateRemoteParticipant('user-1', { isSpeaking: true })

      expect(
        useParticipantPresenceStore.getState().remoteParticipants['user-1'].isSpeaking
      ).toBe(true)
    })

    it('should update laser target', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState())
      useParticipantPresenceStore
        .getState()
        .updateRemoteParticipant('user-1', { laserTarget: [3, 2, 1] })

      expect(
        useParticipantPresenceStore.getState().remoteParticipants['user-1'].laserTarget
      ).toEqual([3, 2, 1])
    })

    it('should no-op for non-existent participant', () => {
      useParticipantPresenceStore
        .getState()
        .updateRemoteParticipant('nonexistent', { position: [1, 1, 1] })

      expect(
        useParticipantPresenceStore.getState().remoteParticipants['nonexistent']
      ).toBeUndefined()
    })

    it('should update active tool', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState({ activeTool: 'navigate' }))
      useParticipantPresenceStore
        .getState()
        .updateRemoteParticipant('user-1', { activeTool: 'measure' })

      expect(
        useParticipantPresenceStore.getState().remoteParticipants['user-1'].activeTool
      ).toBe('measure')
    })
  })

  describe('removeRemoteParticipant', () => {
    it('should remove a participant by UID', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState())
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-2', makeParticipantState())

      useParticipantPresenceStore.getState().removeRemoteParticipant('user-1')

      const { remoteParticipants } = useParticipantPresenceStore.getState()
      expect(remoteParticipants['user-1']).toBeUndefined()
      expect(remoteParticipants['user-2']).toBeDefined()
    })

    it('should handle removing non-existent participant gracefully', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState())

      // Should not throw
      useParticipantPresenceStore.getState().removeRemoteParticipant('nonexistent')

      expect(Object.keys(useParticipantPresenceStore.getState().remoteParticipants)).toHaveLength(1)
    })
  })

  describe('clearRemoteParticipants', () => {
    it('should remove all remote participants', () => {
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-1', makeParticipantState())
      useParticipantPresenceStore
        .getState()
        .setRemoteParticipant('user-2', makeParticipantState())

      useParticipantPresenceStore.getState().clearRemoteParticipants()

      expect(useParticipantPresenceStore.getState().remoteParticipants).toEqual({})
    })
  })

  describe('device types', () => {
    it('should support all expected device types', () => {
      const devices = ['quest3', 'vision_pro', 'desktop', 'mobile']

      devices.forEach((device, i) => {
        useParticipantPresenceStore
          .getState()
          .setRemoteParticipant(`user-${i}`, makeParticipantState({ device }))
      })

      const { remoteParticipants } = useParticipantPresenceStore.getState()
      expect(remoteParticipants['user-0'].device).toBe('quest3')
      expect(remoteParticipants['user-1'].device).toBe('vision_pro')
      expect(remoteParticipants['user-2'].device).toBe('desktop')
      expect(remoteParticipants['user-3'].device).toBe('mobile')
    })
  })

  describe('initial state', () => {
    it('should start with empty remote participants', () => {
      expect(useParticipantPresenceStore.getState().remoteParticipants).toEqual({})
    })
  })
})
