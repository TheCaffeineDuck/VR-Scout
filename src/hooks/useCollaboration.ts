import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { useParticipantPresenceStore } from '@/stores/participant-store'
import type { Participant } from '@/types/session'
import {
  type CollaborationEvent,
  createLocalSession,
  createCollaborativeSession,
  joinCollaborativeSession,
  isCollaborationAvailable,
  randomAvatarColor,
  detectDevice,
  generateSessionId,
} from '@/lib/collaboration'
import type { Annotation } from '@/types/annotation'
import type { MeasurementLine } from '@/hooks/useMeasurement'
import type { VirtualCamera } from '@/types/camera'

export function useCollaboration() {
  const {
    currentSession,
    participants,
    isCollaborative,
    connectionStatus,
    collaborationSession,
    setCurrentSession,
    setParticipants,
    addParticipant,
    removeParticipant,
    setIsCollaborative,
    setConnectionStatus,
    setCollaborationSession,
  } = useSessionStore()

  const {
    setRemoteParticipant,
    updateRemoteParticipant,
    removeRemoteParticipant,
    clearRemoteParticipants,
  } = useParticipantPresenceStore()

  const eventListenerRef = useRef<((event: CollaborationEvent) => void) | null>(null)

  // Handle incoming collaboration events.
  // Capture the session at effect setup time so cleanup always references
  // the correct session, even if the store changes later.
  useEffect(() => {
    const session = collaborationSession
    if (!session) return

    const listener = (event: CollaborationEvent) => {
      switch (event.type) {
        case 'participant-joined': {
          const p: Participant = {
            uid: event.participant.uid,
            displayName: event.participant.displayName,
            avatarColor: event.participant.avatarColor,
            device: event.participant.device as Participant['device'],
            joinedAt: new Date(),
          }
          addParticipant(p)
          setRemoteParticipant(event.participant.uid, {
            displayName: event.participant.displayName,
            avatarColor: event.participant.avatarColor,
            device: event.participant.device,
            position: event.participant.position,
            rotation: event.participant.rotation,
            activeTool: event.participant.activeTool,
            laserTarget: event.participant.laserTarget,
            isSpeaking: event.participant.isSpeaking,
          })
          break
        }
        case 'participant-left':
          removeParticipant(event.uid)
          removeRemoteParticipant(event.uid)
          break
        case 'participant-updated':
          updateRemoteParticipant(event.uid, event.updates)
          break
      }
    }

    eventListenerRef.current = listener
    session.on(listener)

    return () => {
      // Use the captured `session` so cleanup isn't stale
      if (eventListenerRef.current) {
        session.off(eventListenerRef.current)
      }
    }
  }, [collaborationSession, addParticipant, removeParticipant, setRemoteParticipant, updateRemoteParticipant, removeRemoteParticipant])

  const createSession = useCallback(
    async (displayName: string, sessionName?: string) => {
      // Reject if already connecting — prevents race conditions
      const status = useSessionStore.getState().connectionStatus
      if (status === 'connecting') {
        console.warn('[Collaboration] Session creation already in progress')
        return null
      }

      // Disconnect existing session
      const existing = useSessionStore.getState().collaborationSession
      if (existing) {
        existing.disconnect()
        setCollaborationSession(null)
      }

      setConnectionStatus('connecting')

      try {
        const collaborative = isCollaborationAvailable()
        const session = collaborative
          ? await createCollaborativeSession(displayName, sessionName || generateSessionId())
          : createLocalSession(displayName)

        setCollaborationSession(session)

        const localParticipant: Participant = {
          uid: session.localUid,
          displayName,
          avatarColor: randomAvatarColor(),
          device: detectDevice() as Participant['device'],
          joinedAt: new Date(),
        }

        setCurrentSession({
          id: session.sessionId,
          locationId: '',
          virtualTourId: '',
          sessionType: collaborative ? 'collaborative' : 'solo',
          status: 'active',
          accessCode: null,
          hostUid: session.localUid,
          participants: [localParticipant],
          virtualCameras: [],
          croquetSessionId: session.sessionId,
          livekitRoomName: `vr-scout-${session.sessionId}`,
          createdAt: new Date(),
        })

        setParticipants([localParticipant])
        setIsCollaborative(!session.isLocalOnly)
        setConnectionStatus(session.isConnected ? 'connected' : 'error')

        return session
      } catch {
        setConnectionStatus('error')
        return null
      }
    },
    [setCurrentSession, setParticipants, setIsCollaborative, setConnectionStatus, setCollaborationSession],
  )

  const joinSession = useCallback(
    async (displayName: string, sessionId: string, accessCode?: string) => {
      // Reject if already connecting
      const status = useSessionStore.getState().connectionStatus
      if (status === 'connecting') {
        console.warn('[Collaboration] Session join already in progress')
        return null
      }

      const existing = useSessionStore.getState().collaborationSession
      if (existing) {
        existing.disconnect()
        setCollaborationSession(null)
      }

      setConnectionStatus('connecting')

      try {
        const session = await joinCollaborativeSession(displayName, sessionId, accessCode)
        setCollaborationSession(session)

        const localParticipant: Participant = {
          uid: session.localUid,
          displayName,
          avatarColor: randomAvatarColor(),
          device: detectDevice() as Participant['device'],
          joinedAt: new Date(),
        }

        setCurrentSession({
          id: session.sessionId,
          locationId: '',
          virtualTourId: '',
          sessionType: 'collaborative',
          status: 'active',
          accessCode: accessCode || null,
          hostUid: '', // host is whoever created
          participants: [localParticipant],
          virtualCameras: [],
          croquetSessionId: session.sessionId,
          livekitRoomName: `vr-scout-${session.sessionId}`,
          createdAt: new Date(),
        })

        setParticipants([localParticipant])
        setIsCollaborative(true)
        setConnectionStatus('connected')

        return session
      } catch {
        setConnectionStatus('error')
        return null
      }
    },
    [setCurrentSession, setParticipants, setIsCollaborative, setConnectionStatus, setCollaborationSession],
  )

  const leaveSession = useCallback(() => {
    const session = useSessionStore.getState().collaborationSession
    if (session) {
      session.disconnect()
      setCollaborationSession(null)
    }
    setCurrentSession(null)
    setParticipants([])
    setIsCollaborative(false)
    setConnectionStatus('disconnected')
    clearRemoteParticipants()
  }, [setCurrentSession, setParticipants, setIsCollaborative, setConnectionStatus, setCollaborationSession, clearRemoteParticipants])

  // Broadcast helpers read the session from the store at call time
  const broadcastPosition = useCallback(
    (position: [number, number, number], rotation: [number, number, number]) => {
      useSessionStore.getState().collaborationSession?.broadcastPosition(position, rotation)
    },
    [],
  )

  const broadcastLaser = useCallback((target: [number, number, number] | null) => {
    useSessionStore.getState().collaborationSession?.broadcastLaser(target)
  }, [])

  const broadcastAnnotation = useCallback(
    (action: 'add' | 'remove', data: Annotation | string) => {
      useSessionStore.getState().collaborationSession?.broadcastAnnotation(action, data)
    },
    [],
  )

  const broadcastMeasurement = useCallback(
    (action: 'add' | 'remove', data: MeasurementLine | string) => {
      useSessionStore.getState().collaborationSession?.broadcastMeasurement(action, data)
    },
    [],
  )

  const broadcastCamera = useCallback(
    (
      action: 'add' | 'remove' | 'update',
      data: VirtualCamera | string | { id: string; updates: Partial<VirtualCamera> },
    ) => {
      useSessionStore.getState().collaborationSession?.broadcastCamera(action, data)
    },
    [],
  )

  return {
    // State
    currentSession,
    participants,
    isCollaborative,
    connectionStatus,
    isAvailable: isCollaborationAvailable(),
    localUid: collaborationSession?.localUid ?? null,

    // Session lifecycle
    createSession,
    joinSession,
    leaveSession,

    // Broadcast
    broadcastPosition,
    broadcastLaser,
    broadcastAnnotation,
    broadcastMeasurement,
    broadcastCamera,
  }
}
