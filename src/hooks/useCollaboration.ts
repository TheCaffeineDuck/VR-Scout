import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { useParticipantPresenceStore } from '@/stores/participant-store'
import type { Participant } from '@/types/session'
import {
  type CollaborationSession,
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

// Singleton session ref shared across hook consumers
let activeSession: CollaborationSession | null = null

export function useCollaboration() {
  const {
    currentSession,
    participants,
    isCollaborative,
    connectionStatus,
    setCurrentSession,
    setParticipants,
    addParticipant,
    removeParticipant,
    setIsCollaborative,
    setConnectionStatus,
  } = useSessionStore()

  const {
    setRemoteParticipant,
    updateRemoteParticipant,
    removeRemoteParticipant,
    clearRemoteParticipants,
  } = useParticipantPresenceStore()

  const eventListenerRef = useRef<((event: CollaborationEvent) => void) | null>(null)

  // Handle incoming collaboration events
  useEffect(() => {
    if (!activeSession) return

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
    activeSession.on(listener)

    return () => {
      if (activeSession && eventListenerRef.current) {
        activeSession.off(eventListenerRef.current)
      }
    }
  }, [addParticipant, removeParticipant, setRemoteParticipant, updateRemoteParticipant, removeRemoteParticipant])

  const createSession = useCallback(
    async (displayName: string, sessionName?: string) => {
      // Disconnect existing session
      if (activeSession) {
        activeSession.disconnect()
        activeSession = null
      }

      setConnectionStatus('connecting')

      try {
        const collaborative = isCollaborationAvailable()
        const session = collaborative
          ? await createCollaborativeSession(displayName, sessionName || generateSessionId())
          : createLocalSession(displayName)

        activeSession = session

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
    [setCurrentSession, setParticipants, setIsCollaborative, setConnectionStatus],
  )

  const joinSession = useCallback(
    async (displayName: string, sessionId: string, accessCode?: string) => {
      if (activeSession) {
        activeSession.disconnect()
        activeSession = null
      }

      setConnectionStatus('connecting')

      try {
        const session = await joinCollaborativeSession(displayName, sessionId, accessCode)
        activeSession = session

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
    [setCurrentSession, setParticipants, setIsCollaborative, setConnectionStatus],
  )

  const leaveSession = useCallback(() => {
    if (activeSession) {
      activeSession.disconnect()
      activeSession = null
    }
    setCurrentSession(null)
    setParticipants([])
    setIsCollaborative(false)
    setConnectionStatus('disconnected')
    clearRemoteParticipants()
  }, [setCurrentSession, setParticipants, setIsCollaborative, setConnectionStatus, clearRemoteParticipants])

  // Broadcast helpers
  const broadcastPosition = useCallback(
    (position: [number, number, number], rotation: [number, number, number]) => {
      activeSession?.broadcastPosition(position, rotation)
    },
    [],
  )

  const broadcastLaser = useCallback((target: [number, number, number] | null) => {
    activeSession?.broadcastLaser(target)
  }, [])

  const broadcastAnnotation = useCallback(
    (action: 'add' | 'remove', data: Annotation | string) => {
      activeSession?.broadcastAnnotation(action, data)
    },
    [],
  )

  const broadcastMeasurement = useCallback(
    (action: 'add' | 'remove', data: MeasurementLine | string) => {
      activeSession?.broadcastMeasurement(action, data)
    },
    [],
  )

  const broadcastCamera = useCallback(
    (
      action: 'add' | 'remove' | 'update',
      data: VirtualCamera | string | { id: string; updates: Partial<VirtualCamera> },
    ) => {
      activeSession?.broadcastCamera(action, data)
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
    localUid: activeSession?.localUid ?? null,

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
