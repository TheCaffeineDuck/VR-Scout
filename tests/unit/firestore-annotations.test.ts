import { describe, it, expect, beforeEach } from 'vitest'
import {
  createAnnotation,
  getAnnotation,
  updateAnnotation,
  deleteAnnotation,
  listAnnotationsByTour,
  onAnnotationsChange,
} from '@/lib/firestore/annotations'
import { localClear } from '@/lib/local-persistence'
import type { Annotation, AnnotationType } from '@/types/annotation'
import { ANNOTATION_TYPES } from '@/types/annotation'

/** Factory for a minimal valid annotation input (without id, createdAt). */
function makeAnnotationInput(
  overrides: Partial<Omit<Annotation, 'id' | 'createdAt'>> = {}
): Omit<Annotation, 'id' | 'createdAt'> {
  return {
    locationId: 'loc-1',
    virtualTourId: 'tour-1',
    sessionId: null,
    position: [1, 2, 3],
    normal: [0, 1, 0],
    type: 'power',
    title: { en: 'Outlet near door', th: 'เต้ารับใกล้ประตู' },
    description: { en: 'Standard 220V outlet', th: 'เต้ารับมาตรฐาน 220V' },
    visibility: 'team',
    createdBy: 'user-1',
    ...overrides,
  }
}

describe('firestore-annotations (local fallback)', () => {
  beforeEach(() => {
    localClear('vr_annotations')
  })

  describe('createAnnotation', () => {
    it('should create an annotation with generated id and timestamp', async () => {
      const ann = await createAnnotation(makeAnnotationInput())

      expect(ann.id).toBeDefined()
      expect(typeof ann.id).toBe('string')
      expect(ann.createdAt).toBeInstanceOf(Date)
      expect(ann.type).toBe('power')
    })

    it('should store all required fields correctly', async () => {
      const ann = await createAnnotation(makeAnnotationInput())
      const fetched = await getAnnotation(ann.id)

      expect(fetched).not.toBeNull()
      expect(fetched!.position).toEqual([1, 2, 3])
      expect(fetched!.normal).toEqual([0, 1, 0])
      expect(fetched!.visibility).toBe('team')
      expect(fetched!.createdBy).toBe('user-1')
    })

    it('should preserve bilingual title and description', async () => {
      const ann = await createAnnotation(makeAnnotationInput())
      const fetched = await getAnnotation(ann.id)

      expect(fetched!.title.en).toBe('Outlet near door')
      expect(fetched!.title.th).toBe('เต้ารับใกล้ประตู')
      expect(fetched!.description.en).toBe('Standard 220V outlet')
      expect(fetched!.description.th).toBe('เต้ารับมาตรฐาน 220V')
    })

    it('should store annotation with optional measurement field', async () => {
      const ann = await createAnnotation(
        makeAnnotationInput({
          type: 'ceiling',
          measurement: {
            start: [0, 0, 0],
            end: [0, 3.5, 0],
            distance: 3.5,
          },
        })
      )
      const fetched = await getAnnotation(ann.id)

      expect(fetched!.measurement).toBeDefined()
      expect(fetched!.measurement!.distance).toBe(3.5)
      expect(fetched!.measurement!.start).toEqual([0, 0, 0])
      expect(fetched!.measurement!.end).toEqual([0, 3.5, 0])
    })

    it('should create annotations of every valid type', async () => {
      const types: AnnotationType[] = [
        'power', 'parking', 'sound', 'light', 'access', 'ceiling', 'restriction', 'custom',
      ]

      for (const type of types) {
        const ann = await createAnnotation(makeAnnotationInput({ type }))
        expect(ann.type).toBe(type)
        // Verify it's a known type in ANNOTATION_TYPES
        expect(ANNOTATION_TYPES[type]).toBeDefined()
      }
    })
  })

  describe('getAnnotation', () => {
    it('should return null for non-existent annotation', async () => {
      const result = await getAnnotation('nonexistent')
      expect(result).toBeNull()
    })

    it('should round-trip position and normal vectors', async () => {
      const ann = await createAnnotation(
        makeAnnotationInput({
          position: [10.5, -3.2, 7.8],
          normal: [0.577, 0.577, 0.577],
        })
      )
      const fetched = await getAnnotation(ann.id)

      expect(fetched!.position[0]).toBeCloseTo(10.5)
      expect(fetched!.position[1]).toBeCloseTo(-3.2)
      expect(fetched!.normal[0]).toBeCloseTo(0.577)
    })
  })

  describe('updateAnnotation', () => {
    it('should partially update annotation fields', async () => {
      const ann = await createAnnotation(makeAnnotationInput())
      await updateAnnotation(ann.id, { visibility: 'public' })

      const fetched = await getAnnotation(ann.id)
      expect(fetched!.visibility).toBe('public')
      expect(fetched!.type).toBe('power') // unchanged
    })

    it('should update bilingual title', async () => {
      const ann = await createAnnotation(makeAnnotationInput())
      await updateAnnotation(ann.id, {
        title: { en: 'Updated title', th: 'หัวข้อที่อัปเดต' },
      })

      const fetched = await getAnnotation(ann.id)
      expect(fetched!.title.en).toBe('Updated title')
      expect(fetched!.title.th).toBe('หัวข้อที่อัปเดต')
    })

    it('should update position', async () => {
      const ann = await createAnnotation(makeAnnotationInput())
      await updateAnnotation(ann.id, { position: [5, 5, 5] })

      const fetched = await getAnnotation(ann.id)
      expect(fetched!.position).toEqual([5, 5, 5])
    })

    it('should not throw when updating non-existent annotation', async () => {
      await expect(
        updateAnnotation('nonexistent', { visibility: 'private' })
      ).resolves.toBeUndefined()
    })
  })

  describe('deleteAnnotation', () => {
    it('should remove an annotation', async () => {
      const ann = await createAnnotation(makeAnnotationInput())
      await deleteAnnotation(ann.id)

      const fetched = await getAnnotation(ann.id)
      expect(fetched).toBeNull()
    })

    it('should not affect other annotations', async () => {
      const a1 = await createAnnotation(makeAnnotationInput({ type: 'power' }))
      const a2 = await createAnnotation(makeAnnotationInput({ type: 'sound' }))
      await deleteAnnotation(a1.id)

      expect(await getAnnotation(a1.id)).toBeNull()
      expect(await getAnnotation(a2.id)).not.toBeNull()
    })
  })

  describe('listAnnotationsByTour', () => {
    it('should return only annotations for the specified tour', async () => {
      await createAnnotation(makeAnnotationInput({ virtualTourId: 'tour-1' }))
      await createAnnotation(makeAnnotationInput({ virtualTourId: 'tour-1' }))
      await createAnnotation(makeAnnotationInput({ virtualTourId: 'tour-2' }))

      const results = await listAnnotationsByTour('tour-1')
      expect(results).toHaveLength(2)
      results.forEach((a) => expect(a.virtualTourId).toBe('tour-1'))
    })

    it('should return empty array when no annotations match', async () => {
      await createAnnotation(makeAnnotationInput({ virtualTourId: 'tour-1' }))
      const results = await listAnnotationsByTour('tour-999')
      expect(results).toEqual([])
    })

    it('should return annotations sorted by createdAt descending', async () => {
      const a1 = await createAnnotation(
        makeAnnotationInput({ virtualTourId: 'tour-1', type: 'power' })
      )
      await new Promise((r) => setTimeout(r, 10))
      const a2 = await createAnnotation(
        makeAnnotationInput({ virtualTourId: 'tour-1', type: 'sound' })
      )

      const results = await listAnnotationsByTour('tour-1')
      expect(results).toHaveLength(2)
      // Most recent first
      expect(results[0].type).toBe('sound')
      expect(results[1].type).toBe('power')
    })
  })

  describe('onAnnotationsChange (local mode)', () => {
    it('should call callback with current annotations', async () => {
      await createAnnotation(makeAnnotationInput({ virtualTourId: 'tour-1' }))

      const received: Annotation[][] = []
      const unsub = onAnnotationsChange('tour-1', (annotations) => {
        received.push(annotations)
      })

      // In local mode, callback is called asynchronously via .then
      await new Promise((r) => setTimeout(r, 50))
      expect(received.length).toBeGreaterThanOrEqual(1)
      expect(received[0]).toHaveLength(1)

      // unsub should be a no-op function
      expect(typeof unsub).toBe('function')
      unsub()
    })

    it('should return a function (unsubscribe) in local mode', () => {
      const unsub = onAnnotationsChange('tour-1', () => {})
      expect(typeof unsub).toBe('function')
      unsub() // should not throw
    })
  })

  describe('annotation type validation', () => {
    it('should have exactly 8 annotation types defined', () => {
      expect(Object.keys(ANNOTATION_TYPES)).toHaveLength(8)
    })

    it('each type should have icon, label, and color', () => {
      for (const [key, config] of Object.entries(ANNOTATION_TYPES)) {
        expect(config.type).toBe(key)
        expect(config.icon).toBeDefined()
        expect(config.label).toBeDefined()
        expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })
  })
})
