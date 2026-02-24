export interface CinemaLens {
  focalLength: number
  fov: number
  name: string
}

export const CINEMA_LENSES: CinemaLens[] = [
  { focalLength: 18,  fov: 90, name: '18mm Ultra Wide' },
  { focalLength: 24,  fov: 73, name: '24mm Wide' },
  { focalLength: 35,  fov: 54, name: '35mm Standard' },
  { focalLength: 50,  fov: 39, name: '50mm Normal' },
  { focalLength: 85,  fov: 24, name: '85mm Portrait' },
  { focalLength: 135, fov: 15, name: '135mm Telephoto' },
]

export interface VirtualCamera {
  id: string
  position: [number, number, number]
  rotation: [number, number, number]
  lensIndex: number
  placedBy: string
}
