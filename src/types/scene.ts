export interface SceneLOD {
  preview?: string
  medium?: string
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

/**
 * Source coordinate convention of the SPZ/PLY data.
 *
 * - 'opencv': INRIA 3DGS / raw COLMAP output (Y-down, Z-forward).
 *   Needs 180° X rotation to display correctly in Three.js (Y-up).
 * - 'opengl': Nerfstudio Splatfacto / already Y-up data.
 *   No rotation needed — data is already in Three.js convention.
 */
export type SplatCoordinateSystem = 'opencv' | 'opengl'

export interface VirtualTour {
  id: string
  locationId: string
  tourType: 'triangle_mesh' | 'gaussian_splat' | 'panorama'
  splatUrls: SceneLOD
  splatCount: number
  fileSize: number
  bounds: { min: [number, number, number]; max: [number, number, number] }
  spawnPoint: { position: [number, number, number]; rotation: [number, number, number] }
  /** Coordinate convention of the splat data. Defaults to 'opencv'. */
  coordinateSystem?: SplatCoordinateSystem
  /** Additional Euler rotation [x, y, z] in radians applied after coordinate conversion. */
  sceneRotation?: [number, number, number]
  viewpoints: Viewpoint[]
  floorPlan: FloorPlan | null
  qcChecklist: QCChecklist
  gps: { lat: number; lng: number }
  status: 'draft' | 'published' | 'archived'
  createdAt: Date
  updatedAt: Date
}
