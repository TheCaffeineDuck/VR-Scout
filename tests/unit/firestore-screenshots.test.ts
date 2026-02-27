import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveScreenshot,
  getScreenshot,
  listScreenshots,
  listAllScreenshots,
  deleteScreenshot,
  type ScreenshotRecord,
} from '@/lib/firestore/screenshots'
import { localClear } from '@/lib/local-persistence'

function makeScreenshotInput(
  overrides: Partial<Omit<ScreenshotRecord, 'id' | 'createdAt'>> = {}
): Omit<ScreenshotRecord, 'id' | 'createdAt'> {
  return {
    locationId: 'loc-1',
    virtualTourId: 'tour-1',
    url: 'data:image/jpeg;base64,/9j/4AAQ...',
    lensMm: 35,
    cameraPosition: [1.5, 1.6, 3.0],
    cameraRotation: [0, 45, 0],
    gps: { lat: 13.7563, lng: 100.5018 },
    filename: 'LOC-loc1_35mm_2025-01-15_001.jpg',
    tags: ['entrance', 'wide-shot'],
    capturedBy: 'user-1',
    ...overrides,
  }
}

describe('firestore-screenshots (local fallback)', () => {
  beforeEach(() => {
    localClear('vr_screenshots')
  })

  describe('saveScreenshot', () => {
    it('should save a screenshot with generated id and timestamp', async () => {
      const rec = await saveScreenshot(makeScreenshotInput())

      expect(rec.id).toBeDefined()
      expect(typeof rec.id).toBe('string')
      expect(rec.createdAt).toBeInstanceOf(Date)
    })

    it('should store all metadata fields', async () => {
      const rec = await saveScreenshot(makeScreenshotInput())
      const fetched = await getScreenshot(rec.id)

      expect(fetched!.lensMm).toBe(35)
      expect(fetched!.cameraPosition).toEqual([1.5, 1.6, 3.0])
      expect(fetched!.cameraRotation).toEqual([0, 45, 0])
      expect(fetched!.gps).toEqual({ lat: 13.7563, lng: 100.5018 })
      expect(fetched!.capturedBy).toBe('user-1')
    })

    it('should store filename matching spec format', async () => {
      const rec = await saveScreenshot(
        makeScreenshotInput({ filename: 'LOC-beach_50mm_2025-06-20_003.jpg' })
      )
      const fetched = await getScreenshot(rec.id)

      expect(fetched!.filename).toBe('LOC-beach_50mm_2025-06-20_003.jpg')
      // Verify filename pattern: LOC-{id}_{lens}mm_{date}_{seq}.jpg
      expect(fetched!.filename).toMatch(/^LOC-\w+_\d+mm_\d{4}-\d{2}-\d{2}_\d{3}\.jpg$/)
    })

    it('should store tags array', async () => {
      const rec = await saveScreenshot(
        makeScreenshotInput({ tags: ['sunset', 'golden-hour', 'exterior'] })
      )
      const fetched = await getScreenshot(rec.id)

      expect(fetched!.tags).toEqual(['sunset', 'golden-hour', 'exterior'])
    })

    it('should handle null GPS', async () => {
      const rec = await saveScreenshot(makeScreenshotInput({ gps: null }))
      const fetched = await getScreenshot(rec.id)

      expect(fetched!.gps).toBeNull()
    })

    it('should store different lens focal lengths', async () => {
      const lenses = [18, 24, 35, 50, 85, 135]
      for (const lensMm of lenses) {
        const rec = await saveScreenshot(makeScreenshotInput({ lensMm }))
        expect(rec.lensMm).toBe(lensMm)
      }
    })
  })

  describe('getScreenshot', () => {
    it('should return null for non-existent screenshot', async () => {
      const result = await getScreenshot('nonexistent')
      expect(result).toBeNull()
    })

    it('should round-trip camera position precisely', async () => {
      const rec = await saveScreenshot(
        makeScreenshotInput({ cameraPosition: [10.123, 1.6, -5.789] })
      )
      const fetched = await getScreenshot(rec.id)

      expect(fetched!.cameraPosition[0]).toBeCloseTo(10.123)
      expect(fetched!.cameraPosition[1]).toBeCloseTo(1.6)
      expect(fetched!.cameraPosition[2]).toBeCloseTo(-5.789)
    })
  })

  describe('listScreenshots', () => {
    it('should filter by virtualTourId', async () => {
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-1' }))
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-1' }))
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-2' }))

      const results = await listScreenshots('tour-1')
      expect(results).toHaveLength(2)
      results.forEach((r) => expect(r.virtualTourId).toBe('tour-1'))
    })

    it('should return empty array when no screenshots match', async () => {
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-1' }))
      const results = await listScreenshots('tour-999')
      expect(results).toEqual([])
    })

    it('should sort by createdAt descending', async () => {
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-1', lensMm: 18 }))
      await new Promise((r) => setTimeout(r, 10))
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-1', lensMm: 50 }))

      const results = await listScreenshots('tour-1')
      expect(results[0].lensMm).toBe(50) // most recent first
      expect(results[1].lensMm).toBe(18)
    })
  })

  describe('listAllScreenshots', () => {
    it('should return all screenshots across tours', async () => {
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-1' }))
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-2' }))
      await saveScreenshot(makeScreenshotInput({ virtualTourId: 'tour-3' }))

      const results = await listAllScreenshots()
      expect(results).toHaveLength(3)
    })

    it('should return empty array when none exist', async () => {
      const results = await listAllScreenshots()
      expect(results).toEqual([])
    })
  })

  describe('deleteScreenshot', () => {
    it('should remove a screenshot', async () => {
      const rec = await saveScreenshot(makeScreenshotInput())
      await deleteScreenshot(rec.id)

      expect(await getScreenshot(rec.id)).toBeNull()
    })

    it('should not affect other screenshots', async () => {
      const r1 = await saveScreenshot(makeScreenshotInput({ lensMm: 35 }))
      const r2 = await saveScreenshot(makeScreenshotInput({ lensMm: 50 }))
      await deleteScreenshot(r1.id)

      expect(await getScreenshot(r1.id)).toBeNull()
      const remaining = await getScreenshot(r2.id)
      expect(remaining).not.toBeNull()
      expect(remaining!.lensMm).toBe(50)
    })
  })
})
