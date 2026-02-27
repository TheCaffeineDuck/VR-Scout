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
      preview: '/scenes/room_preview.spz',
      medium: '/scenes/room_medium.spz',
      high: '/scenes/room_high.spz',
    },
    splatCount: 973_000,
    fileSize: 11_500_000,
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
      preview: '/scenes/garden_preview.spz',
      medium: '/scenes/garden_medium.spz',
      high: '/scenes/garden_high.spz',
    },
    splatCount: 1_600_000,
    fileSize: 21_500_000,
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
