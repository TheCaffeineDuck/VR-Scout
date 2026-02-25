/**
 * Collaboration network layer with Croquet integration.
 * Falls back to local-only mode when env vars are missing or placeholders.
 */

import type { Annotation } from '@/types/annotation'
import type { MeasurementLine } from '@/hooks/useMeasurement'
import type { VirtualCamera } from '@/types/camera'

// ---- Env check ----

function getEnvVar(key: string): string | null {
  const val = import.meta.env[key] as string | undefined
  if (!val || val.startsWith('your-')) return null
  return val
}

export function isCroquetConfigured(): boolean {
  return !!(getEnvVar('VITE_CROQUET_APP_ID') && getEnvVar('VITE_CROQUET_API_KEY'))
}

export function isLiveKitConfigured(): boolean {
  return !!(getEnvVar('VITE_LIVEKIT_URL') && getEnvVar('VITE_LIVEKIT_API_KEY'))
}

export function isCollaborationAvailable(): boolean {
  return isCroquetConfigured()
}

// ---- Shared state types ----

export interface ParticipantState {
  uid: string
  displayName: string
  avatarColor: string
  device: string
  position: [number, number, number]
  rotation: [number, number, number]
  activeTool: string
  laserTarget: [number, number, number] | null
  isSpeaking: boolean
}

export interface SharedSessionState {
  participants: Map<string, ParticipantState>
  annotations: Annotation[]
  measurements: MeasurementLine[]
  virtualCameras: VirtualCamera[]
  laserPointers: Map<string, [number, number, number]>
}

// ---- Event types ----

export type CollaborationEvent =
  | { type: 'participant-joined'; participant: ParticipantState }
  | { type: 'participant-left'; uid: string }
  | { type: 'participant-updated'; uid: string; updates: Partial<ParticipantState> }
  | { type: 'annotation-added'; annotation: Annotation }
  | { type: 'annotation-removed'; id: string }
  | { type: 'measurement-added'; measurement: MeasurementLine }
  | { type: 'measurement-removed'; id: string }
  | { type: 'camera-added'; camera: VirtualCamera }
  | { type: 'camera-removed'; id: string }
  | { type: 'camera-updated'; id: string; updates: Partial<VirtualCamera> }
  | { type: 'laser-updated'; uid: string; target: [number, number, number] | null }

type EventListener = (event: CollaborationEvent) => void

// ---- Session interface ----

export interface CollaborationSession {
  sessionId: string
  localUid: string
  isConnected: boolean
  isLocalOnly: boolean

  // State broadcast
  broadcastPosition: (position: [number, number, number], rotation: [number, number, number]) => void
  broadcastLaser: (target: [number, number, number] | null) => void
  broadcastAnnotation: (action: 'add' | 'remove', data: Annotation | string) => void
  broadcastMeasurement: (action: 'add' | 'remove', data: MeasurementLine | string) => void
  broadcastCamera: (action: 'add' | 'remove' | 'update', data: VirtualCamera | string | { id: string; updates: Partial<VirtualCamera> }) => void

  // Event subscription
  on: (listener: EventListener) => void
  off: (listener: EventListener) => void

  // Lifecycle
  disconnect: () => void
}

// ---- Local-only mock session ----

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const AVATAR_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

function detectDevice(): string {
  if (navigator.userAgent.includes('Quest')) return 'quest3'
  if (navigator.userAgent.includes('Vision')) return 'vision_pro'
  if ('ontouchstart' in window && window.innerWidth < 768) return 'mobile'
  return 'desktop'
}

export function createLocalSession(displayName: string): CollaborationSession {
  const sessionId = `local-${generateId()}`
  const localUid = `user-${generateId()}`
  const listeners = new Set<EventListener>()

  return {
    sessionId,
    localUid,
    isConnected: true,
    isLocalOnly: true,

    broadcastPosition: () => {},
    broadcastLaser: () => {},
    broadcastAnnotation: () => {},
    broadcastMeasurement: () => {},
    broadcastCamera: () => {},

    on: (listener) => listeners.add(listener),
    off: (listener) => listeners.delete(listener),
    disconnect: () => listeners.clear(),
  }
}

// ---- Croquet-backed session (stub for when SDK is connected) ----

export async function createCollaborativeSession(
  displayName: string,
  sessionName: string,
  accessCode?: string,
): Promise<CollaborationSession> {
  if (!isCroquetConfigured()) {
    console.warn('[Collaboration] Croquet not configured — falling back to local-only mode')
    return createLocalSession(displayName)
  }

  // TODO: Replace with real Croquet SDK when API keys are available
  // For now, simulate connection and fall back to local
  console.log(`[Collaboration] Would connect to Croquet session: ${sessionName}`)

  const sessionId = `croquet-${generateId()}`
  const localUid = `user-${generateId()}`
  const listeners = new Set<EventListener>()

  function emit(event: CollaborationEvent) {
    listeners.forEach((fn) => fn(event))
    // Also dispatch as CustomEvent for SharedToolSync bridge
    window.dispatchEvent(new CustomEvent('collab-event', { detail: event }))
  }

  return {
    sessionId,
    localUid,
    isConnected: true,
    isLocalOnly: false,

    broadcastPosition: (_pos, _rot) => {
      // Croquet would publish position to shared model
    },
    broadcastLaser: (target) => {
      emit({ type: 'laser-updated', uid: localUid, target })
    },
    broadcastAnnotation: (action, data) => {
      if (action === 'add' && typeof data !== 'string') {
        emit({ type: 'annotation-added', annotation: data })
      } else if (action === 'remove' && typeof data === 'string') {
        emit({ type: 'annotation-removed', id: data })
      }
    },
    broadcastMeasurement: (action, data) => {
      if (action === 'add' && typeof data !== 'string') {
        emit({ type: 'measurement-added', measurement: data })
      } else if (action === 'remove' && typeof data === 'string') {
        emit({ type: 'measurement-removed', id: data })
      }
    },
    broadcastCamera: (action, data) => {
      if (action === 'add' && typeof data === 'object' && 'id' in data && 'position' in data) {
        emit({ type: 'camera-added', camera: data as VirtualCamera })
      } else if (action === 'remove' && typeof data === 'string') {
        emit({ type: 'camera-removed', id: data })
      } else if (action === 'update' && typeof data === 'object' && 'id' in data && 'updates' in data) {
        const { id, updates } = data as { id: string; updates: Partial<VirtualCamera> }
        emit({ type: 'camera-updated', id, updates })
      }
    },

    on: (listener) => listeners.add(listener),
    off: (listener) => listeners.delete(listener),
    disconnect: () => {
      listeners.clear()
    },
  }
}

// ---- Join existing session ----

export async function joinCollaborativeSession(
  displayName: string,
  sessionId: string,
  accessCode?: string,
): Promise<CollaborationSession> {
  return createCollaborativeSession(displayName, sessionId, accessCode)
}

// ---- Utility exports ----

export { generateId as generateSessionId, randomColor as randomAvatarColor, detectDevice }
