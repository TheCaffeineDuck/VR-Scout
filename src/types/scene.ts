export interface SceneLOD {
  preview: string
  medium: string
  high: string
}

export interface Viewpoint {
  id: string
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  thumbnailUrl: string
}

export interface FloorPlan {
  imageUrl: string
  northOffset: number
  bounds: { min: [number, number]; max: [number, number] }
}

export interface QCChecklist {
  noArtifacts: boolean
  fullCoverage: boolean
  accurateLighting: boolean
  calibratedScale: boolean
  fileSizeOk: boolean
  lodGenerated: boolean
  viewpointsMarked: boolean
  annotationsAdded: boolean
}

export interface VirtualTour {
  id: string
  locationId: string
  tourType: 'triangle_mesh' | 'panorama'
  meshUrls: SceneLOD
  triangleCount: number
  fileSize: number
  bounds: { min: [number, number, number]; max: [number, number, number] }
  spawnPoint: { position: [number, number, number]; rotation: [number, number, number] }
  viewpoints: Viewpoint[]
  floorPlan: FloorPlan | null
  qcChecklist: QCChecklist
  gps: { lat: number; lng: number }
  status: 'draft' | 'published'
  createdAt: Date
  updatedAt: Date
}
