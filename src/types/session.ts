import type { VirtualCamera } from './camera'

export type DeviceType = 'quest3' | 'vision_pro' | 'desktop' | 'mobile'

export interface Participant {
  uid: string
  displayName: string
  avatarColor: string
  device: DeviceType
  joinedAt: Date
}

export interface VRSession {
  id: string
  locationId: string
  virtualTourId: string
  sessionType: 'solo' | 'collaborative'
  status: 'active' | 'ended'
  accessCode: string | null
  hostUid: string
  participants: Participant[]
  virtualCameras: VirtualCamera[]
  croquetSessionId: string
  livekitRoomName: string
  createdAt: Date
}
