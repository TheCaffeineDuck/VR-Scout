import { useEffect, useRef } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { useAnnotationStore } from '@/hooks/useAnnotations'
import { useMeasurementStore } from '@/hooks/useMeasurement'
import { useVirtualCameraStore } from '@/hooks/useVirtualCamera'
import { useParticipantPresenceStore } from '@/stores/participant-store'
import type { CollaborationEvent } from '@/lib/collaboration'

/**
 * Bridges collaboration events with local tool stores.
 * When remote users add/remove annotations, measurements, or cameras,
 * this component applies those changes to the local Zustand stores.
 *
 * Rendered as an HTML component (outside Canvas) since it only manages state.
 */
export function SharedToolSync() {
  const connectionStatus = useSessionStore((s) => s.connectionStatus)
  const isCollaborative = useSessionStore((s) => s.isCollaborative)

  const addAnnotation = useAnnotationStore((s) => s.addAnnotation)
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation)
  const addMeasurement = useMeasurementStore((s) => s.addMeasurement)
  const removeMeasurement = useMeasurementStore((s) => s.removeMeasurement)
  const addCamera = useVirtualCameraStore((s) => s.addCamera)
  const removeCamera = useVirtualCameraStore((s) => s.removeCamera)
  const updateCamera = useVirtualCameraStore((s) => s.updateCamera)
  const updateRemoteParticipant = useParticipantPresenceStore((s) => s.updateRemoteParticipant)

  // Track latest callback refs to avoid stale closures
  const callbacksRef = useRef({
    addAnnotation,
    removeAnnotation,
    addMeasurement,
    removeMeasurement,
    addCamera,
    removeCamera,
    updateCamera,
    updateRemoteParticipant,
  })
  callbacksRef.current = {
    addAnnotation,
    removeAnnotation,
    addMeasurement,
    removeMeasurement,
    addCamera,
    removeCamera,
    updateCamera,
    updateRemoteParticipant,
  }

  useEffect(() => {
    if (connectionStatus !== 'connected' || !isCollaborative) return

    // Listen for custom events dispatched by the collaboration layer
    const handleCollabEvent = (e: Event) => {
      const event = (e as CustomEvent<CollaborationEvent>).detail
      const cb = callbacksRef.current

      switch (event.type) {
        case 'annotation-added':
          cb.addAnnotation(event.annotation)
          break
        case 'annotation-removed':
          cb.removeAnnotation(event.id)
          break
        case 'measurement-added':
          cb.addMeasurement(event.measurement)
          break
        case 'measurement-removed':
          cb.removeMeasurement(event.id)
          break
        case 'camera-added':
          cb.addCamera(event.camera)
          break
        case 'camera-removed':
          cb.removeCamera(event.id)
          break
        case 'camera-updated':
          cb.updateCamera(event.id, event.updates)
          break
        case 'laser-updated':
          cb.updateRemoteParticipant(event.uid, { laserTarget: event.target })
          break
      }
    }

    window.addEventListener('collab-event', handleCollabEvent)
    return () => window.removeEventListener('collab-event', handleCollabEvent)
  }, [connectionStatus, isCollaborative])

  return null
}

/**
 * Dispatch a collaboration event as a CustomEvent so SharedToolSync can pick it up.
 * Called from the collaboration session when events arrive from remote peers.
 */
export function dispatchCollabEvent(event: CollaborationEvent) {
  window.dispatchEvent(new CustomEvent('collab-event', { detail: event }))
}
