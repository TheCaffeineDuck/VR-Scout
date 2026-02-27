import { describe, it, expect, beforeEach } from 'vitest'
import {
  createTour,
  getTour,
  updateTour,
  deleteTour,
  listTours,
  updateQCChecklist,
  publishTour,
} from '@/lib/firestore/tours'
import { localClear } from '@/lib/local-persistence'
import type { VirtualTour, QCChecklist } from '@/types/scene'

/** Factory for a minimal valid tour (without id, createdAt, updatedAt). */
function makeTourInput(overrides: Partial<Omit<VirtualTour, 'id' | 'createdAt' | 'updatedAt'>> = {}) {
  return {
    locationId: 'loc-1',
    tourType: 'gaussian_splat' as const,
    splatUrls: {
      preview: '/scenes/preview.glb',
      medium: '/scenes/medium.glb',
      high: '/scenes/high.glb',
    },
    splatCount: 100000,
    fileSize: 5_000_000,
    bounds: {
      min: [-10, -1, -10] as [number, number, number],
      max: [10, 5, 10] as [number, number, number],
    },
    spawnPoint: {
      position: [0, 1.6, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    },
    viewpoints: [],
    floorPlan: null,
    qcChecklist: {
      noArtifacts: false,
      fullCoverage: false,
      accurateLighting: false,
      calibratedScale: false,
      fileSizeOk: false,
      lodGenerated: false,
      viewpointsMarked: false,
      annotationsAdded: false,
    },
    gps: { lat: 13.7563, lng: 100.5018 },
    status: 'draft' as const,
    ...overrides,
  }
}

function makeCompleteQC(): QCChecklist {
  return {
    noArtifacts: true,
    fullCoverage: true,
    accurateLighting: true,
    calibratedScale: true,
    fileSizeOk: true,
    lodGenerated: true,
    viewpointsMarked: true,
    annotationsAdded: true,
  }
}

describe('firestore-tours (local fallback)', () => {
  beforeEach(() => {
    localClear('virtual_tours')
  })

  describe('createTour', () => {
    it('should create a tour with generated id and timestamps', async () => {
      const input = makeTourInput()
      const tour = await createTour(input)

      expect(tour.id).toBeDefined()
      expect(typeof tour.id).toBe('string')
      expect(tour.id.length).toBeGreaterThan(0)
      expect(tour.createdAt).toBeInstanceOf(Date)
      expect(tour.updatedAt).toBeInstanceOf(Date)
      expect(tour.locationId).toBe('loc-1')
      expect(tour.tourType).toBe('gaussian_splat')
    })

    it('should store the tour retrievable by getTour', async () => {
      const tour = await createTour(makeTourInput())
      const fetched = await getTour(tour.id)

      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(tour.id)
      expect(fetched!.locationId).toBe('loc-1')
    })

    it('should preserve splat URLs', async () => {
      const tour = await createTour(makeTourInput())
      const fetched = await getTour(tour.id)

      expect(fetched!.splatUrls.preview).toBe('/scenes/preview.glb')
      expect(fetched!.splatUrls.medium).toBe('/scenes/medium.glb')
      expect(fetched!.splatUrls.high).toBe('/scenes/high.glb')
    })

    it('should preserve GPS coordinates', async () => {
      const tour = await createTour(makeTourInput({ gps: { lat: 34.0522, lng: -118.2437 } }))
      const fetched = await getTour(tour.id)

      expect(fetched!.gps.lat).toBeCloseTo(34.0522)
      expect(fetched!.gps.lng).toBeCloseTo(-118.2437)
    })

    it('should initialize with draft status', async () => {
      const tour = await createTour(makeTourInput())
      expect(tour.status).toBe('draft')
    })
  })

  describe('getTour', () => {
    it('should return null for non-existent tour', async () => {
      const result = await getTour('nonexistent-id')
      expect(result).toBeNull()
    })

    it('should round-trip all fields correctly', async () => {
      const input = makeTourInput({
        viewpoints: [
          {
            id: 'vp-1',
            name: 'Entrance',
            position: [1, 1.6, 2],
            rotation: [0, 90, 0],
            thumbnailUrl: '/thumbs/entrance.jpg',
          },
        ],
        floorPlan: {
          imageUrl: '/plans/floor1.png',
          northOffset: 45,
          bounds: { min: [-10, -10], max: [10, 10] },
        },
      })
      const tour = await createTour(input)
      const fetched = await getTour(tour.id)

      expect(fetched!.viewpoints).toHaveLength(1)
      expect(fetched!.viewpoints[0].name).toBe('Entrance')
      expect(fetched!.floorPlan).not.toBeNull()
      expect(fetched!.floorPlan!.northOffset).toBe(45)
    })
  })

  describe('updateTour', () => {
    it('should merge fields into existing tour', async () => {
      const tour = await createTour(makeTourInput())
      await updateTour(tour.id, { splatCount: 200000 })

      const fetched = await getTour(tour.id)
      expect(fetched!.splatCount).toBe(200000)
      expect(fetched!.locationId).toBe('loc-1') // unchanged
    })

    it('should update the updatedAt timestamp', async () => {
      const tour = await createTour(makeTourInput())
      const originalUpdated = tour.updatedAt

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10))
      await updateTour(tour.id, { status: 'published' })

      const fetched = await getTour(tour.id)
      expect(new Date(fetched!.updatedAt).getTime()).toBeGreaterThanOrEqual(
        originalUpdated.getTime()
      )
    })

    it('should handle updating nested objects', async () => {
      const tour = await createTour(makeTourInput())
      await updateTour(tour.id, {
        splatUrls: {
          preview: '/new/preview.glb',
          medium: '/new/medium.glb',
          high: '/new/high.glb',
        },
      })

      const fetched = await getTour(tour.id)
      expect(fetched!.splatUrls.preview).toBe('/new/preview.glb')
    })

    it('should not throw when updating non-existent tour', async () => {
      await expect(updateTour('nonexistent', { status: 'published' })).resolves.toBeUndefined()
    })
  })

  describe('deleteTour', () => {
    it('should remove a tour', async () => {
      const tour = await createTour(makeTourInput())
      await deleteTour(tour.id)

      const fetched = await getTour(tour.id)
      expect(fetched).toBeNull()
    })

    it('should not affect other tours', async () => {
      const tour1 = await createTour(makeTourInput({ locationId: 'loc-1' }))
      const tour2 = await createTour(makeTourInput({ locationId: 'loc-2' }))
      await deleteTour(tour1.id)

      expect(await getTour(tour1.id)).toBeNull()
      expect(await getTour(tour2.id)).not.toBeNull()
    })
  })

  describe('listTours', () => {
    it('should return empty array when no tours exist', async () => {
      const tours = await listTours()
      expect(tours).toEqual([])
    })

    it('should return all tours sorted by createdAt descending', async () => {
      const t1 = await createTour(makeTourInput({ locationId: 'first' }))
      await new Promise((r) => setTimeout(r, 10))
      const t2 = await createTour(makeTourInput({ locationId: 'second' }))

      const tours = await listTours()
      expect(tours).toHaveLength(2)
      // Most recent first
      expect(tours[0].locationId).toBe('second')
      expect(tours[1].locationId).toBe('first')
    })

    it('should reflect deletions', async () => {
      const t1 = await createTour(makeTourInput())
      const t2 = await createTour(makeTourInput())
      await deleteTour(t1.id)

      const tours = await listTours()
      expect(tours).toHaveLength(1)
      expect(tours[0].id).toBe(t2.id)
    })
  })

  describe('updateQCChecklist', () => {
    it('should update individual QC fields', async () => {
      const tour = await createTour(makeTourInput())
      await updateQCChecklist(tour.id, { noArtifacts: true, fullCoverage: true })

      const fetched = await getTour(tour.id)
      expect(fetched!.qcChecklist.noArtifacts).toBe(true)
      expect(fetched!.qcChecklist.fullCoverage).toBe(true)
      expect(fetched!.qcChecklist.accurateLighting).toBe(false) // unchanged
    })

    it('should update all QC fields to true', async () => {
      const tour = await createTour(makeTourInput())
      await updateQCChecklist(tour.id, makeCompleteQC())

      const fetched = await getTour(tour.id)
      expect(Object.values(fetched!.qcChecklist).every(Boolean)).toBe(true)
    })
  })

  describe('publishTour', () => {
    it('should fail when QC checklist is incomplete', async () => {
      const tour = await createTour(makeTourInput())
      const result = await publishTour(tour.id)

      expect(result.success).toBe(false)
      expect(result.error).toBe('QC checklist incomplete')
    })

    it('should succeed when QC checklist is complete', async () => {
      const tour = await createTour(makeTourInput())
      await updateQCChecklist(tour.id, makeCompleteQC())
      const result = await publishTour(tour.id)

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()

      const fetched = await getTour(tour.id)
      expect(fetched!.status).toBe('published')
    })

    it('should fail for non-existent tour', async () => {
      const result = await publishTour('nonexistent')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Tour not found')
    })
  })
})
