import { useState, useEffect } from 'react'
import type { VirtualTour } from '@/types/scene'
import { listTours, getTour } from '@/lib/firestore/tours'

interface UseTourResult {
  tour: VirtualTour | null
  loading: boolean
  error: string | null
}

/** Built-in dev scenes that work without any Firestore data */
const DEV_SCENES: Record<string, VirtualTour> = {
  room: {
    id: 'room',
    locationId: 'room',
    tourType: 'gaussian_splat',
    splatUrls: {
      high: '/scenes/room.spz',
    },
    splatCount: 973_000,
    fileSize: 39_410_096,
    bounds: { min: [-5, 0, -5], max: [5, 3, 5] },
    spawnPoint: { position: [0, 1.6, 5], rotation: [0, 0, 0] },
    viewpoints: [],
    floorPlan: null,
    qcChecklist: {
      noArtifacts: true,
      fullCoverage: true,
      accurateLighting: true,
      calibratedScale: true,
      fileSizeOk: true,
      lodGenerated: true,
      viewpointsMarked: false,
      annotationsAdded: false,
    },
    gps: { lat: 0, lng: 0 },
    status: 'published',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },
  garden: {
    id: 'garden',
    locationId: 'garden',
    tourType: 'gaussian_splat',
    splatUrls: {
      high: '/scenes/garden.spz',
    },
    splatCount: 1_600_000,
    fileSize: 160_048_653,
    bounds: { min: [-10, 0, -10], max: [10, 5, 10] },
    spawnPoint: { position: [0, 1.6, 5], rotation: [0, 0, 0] },
    viewpoints: [],
    floorPlan: null,
    qcChecklist: {
      noArtifacts: true,
      fullCoverage: true,
      accurateLighting: true,
      calibratedScale: true,
      fileSizeOk: true,
      lodGenerated: true,
      viewpointsMarked: false,
      annotationsAdded: false,
    },
    gps: { lat: 0, lng: 0 },
    status: 'published',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },
  outdoor_rooftop: {
    id: 'outdoor_rooftop',
    locationId: 'outdoor_rooftop',
    tourType: 'gaussian_splat',
    splatUrls: {
      high: '/scenes/outdoor_rooftop.spz',
    },
    splatCount: 1_134_961,
    fileSize: 73_778_134,
    bounds: { min: [-2, -5.2, -3.4], max: [4.6, 4.5, 3.9] },
    spawnPoint: { position: [0, 0, 0], rotation: [0, 0, 0] },
    coordinateSystem: 'opengl', // Nerfstudio Splatfacto output — already Y-up
    viewpoints: [],
    floorPlan: null,
    qcChecklist: {
      noArtifacts: false,
      fullCoverage: true,
      accurateLighting: true,
      calibratedScale: false,
      fileSizeOk: true,
      lodGenerated: false,
      viewpointsMarked: false,
      annotationsAdded: false,
    },
    gps: { lat: 0, lng: 0 },
    status: 'published',
    createdAt: new Date('2026-03-08'),
    updatedAt: new Date('2026-03-08'),
  },
  indoor_library: {
    id: 'indoor_library',
    locationId: 'indoor_library',
    tourType: 'gaussian_splat',
    splatUrls: {
      high: '/scenes/indoor_library.spz',
    },
    splatCount: 1_131_390,
    fileSize: 73_539_543,
    bounds: { min: [-13.8, -10.6, -10.0], max: [18.3, 8.5, 12.5] },
    spawnPoint: { position: [0, 0, 0], rotation: [0, 0, 0] },
    coordinateSystem: 'opengl', // Nerfstudio Splatfacto output — already Y-up
    // Floor alignment: Nerfstudio Z-up → Three.js Y-up via -90° X rotation
    // Computed by scripts/align_scene.py from library_area.ply RANSAC floor detection
    sceneRotation: [-1.573323, 0.003568, 0.003559],
    viewpoints: [],
    floorPlan: null,
    qcChecklist: {
      noArtifacts: false,
      fullCoverage: true,
      accurateLighting: true,
      calibratedScale: false,
      fileSizeOk: true,
      lodGenerated: false,
      viewpointsMarked: false,
      annotationsAdded: false,
    },
    gps: { lat: 0, lng: 0 },
    status: 'published',
    createdAt: new Date('2026-03-08'),
    updatedAt: new Date('2026-03-08'),
  },
}

/**
 * Resolves a locationId to a VirtualTour document.
 *
 * Queries Firestore (or local fallback) for a published tour matching the
 * given locationId. Falls back to draft tours for admin preview, and also
 * checks if locationId is a direct tour ID.
 */
export function useTour(locationId: string | undefined): UseTourResult {
  const [tour, setTour] = useState<VirtualTour | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!locationId) {
      setTour(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const id = locationId // capture narrowed value

    async function resolve() {
      setLoading(true)
      setError(null)

      try {
        // Strategy 1: Try to find by locationId field
        const tours = await listTours()
        const published = tours.find(
          (t) => t.locationId === id && t.status === 'published',
        )
        if (!cancelled && published) {
          setTour(published)
          setLoading(false)
          return
        }

        // Strategy 2: Fall back to draft with matching locationId
        const draft = tours.find((t) => t.locationId === id)
        if (!cancelled && draft) {
          setTour(draft)
          setLoading(false)
          return
        }

        // Strategy 3: Maybe locationId is actually a tour ID
        const byId = await getTour(id)
        if (!cancelled && byId) {
          setTour(byId)
          setLoading(false)
          return
        }

        // Strategy 4: For dev — match by tour name/id (case-insensitive)
        const byName = tours.find(
          (t) =>
            t.id.toLowerCase() === id.toLowerCase() ||
            t.locationId.toLowerCase() === id.toLowerCase(),
        )
        if (!cancelled && byName) {
          setTour(byName)
          setLoading(false)
          return
        }

        // Strategy 5: Check built-in dev scenes
        const devScene = DEV_SCENES[id] || DEV_SCENES[id.toLowerCase()]
        if (!cancelled && devScene) {
          setTour(devScene)
          setLoading(false)
          return
        }

        if (!cancelled) {
          setTour(null)
          setError(`No tour found for location "${id}"`)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load tour data',
          )
          setLoading(false)
        }
      }
    }

    resolve()

    return () => {
      cancelled = true
    }
  }, [locationId])

  return { tour, loading, error }
}
