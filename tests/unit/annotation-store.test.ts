import { describe, it, expect, beforeEach } from 'vitest'
import { useAnnotationStore } from '@/hooks/useAnnotations'
import type { Annotation, AnnotationType } from '@/types/annotation'

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann-1',
    locationId: 'loc-1',
    virtualTourId: 'tour-1',
    sessionId: null,
    position: [1, 2, 3],
    normal: [0, 1, 0],
    type: 'power',
    title: { en: 'Test annotation', th: 'คำอธิบายทดสอบ' },
    description: { en: 'A test', th: 'ทดสอบ' },
    visibility: 'team',
    createdBy: 'user-1',
    createdAt: new Date('2025-01-15'),
    ...overrides,
  }
}

describe('annotation-store', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      annotations: [],
      selectedId: null,
      tourId: null,
      _unsubscribe: null,
    })
  })

  describe('addAnnotation', () => {
    it('should add an annotation to the store', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation())

      const { annotations } = useAnnotationStore.getState()
      expect(annotations).toHaveLength(1)
      expect(annotations[0].id).toBe('ann-1')
    })

    it('should preserve all annotation fields', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation())

      const ann = useAnnotationStore.getState().annotations[0]
      expect(ann.position).toEqual([1, 2, 3])
      expect(ann.normal).toEqual([0, 1, 0])
      expect(ann.type).toBe('power')
      expect(ann.title.en).toBe('Test annotation')
      expect(ann.title.th).toBe('คำอธิบายทดสอบ')
      expect(ann.visibility).toBe('team')
      expect(ann.createdBy).toBe('user-1')
    })

    it('should accumulate multiple annotations', () => {
      const { addAnnotation } = useAnnotationStore.getState()
      addAnnotation(makeAnnotation({ id: 'ann-1' }))
      addAnnotation(makeAnnotation({ id: 'ann-2' }))
      addAnnotation(makeAnnotation({ id: 'ann-3' }))

      expect(useAnnotationStore.getState().annotations).toHaveLength(3)
    })
  })

  describe('setSelectedId', () => {
    it('should select an annotation by id', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation({ id: 'ann-1' }))
      useAnnotationStore.getState().setSelectedId('ann-1')

      expect(useAnnotationStore.getState().selectedId).toBe('ann-1')
    })

    it('should deselect with null', () => {
      useAnnotationStore.getState().setSelectedId('ann-1')
      useAnnotationStore.getState().setSelectedId(null)

      expect(useAnnotationStore.getState().selectedId).toBeNull()
    })
  })

  describe('getByType', () => {
    it('should filter annotations by type', () => {
      const { addAnnotation } = useAnnotationStore.getState()
      addAnnotation(makeAnnotation({ id: 'a1', type: 'power' }))
      addAnnotation(makeAnnotation({ id: 'a2', type: 'sound' }))
      addAnnotation(makeAnnotation({ id: 'a3', type: 'power' }))
      addAnnotation(makeAnnotation({ id: 'a4', type: 'light' }))

      const powerAnns = useAnnotationStore.getState().getByType('power')
      expect(powerAnns).toHaveLength(2)
      powerAnns.forEach((a) => expect(a.type).toBe('power'))
    })

    it('should return empty array for type with no annotations', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation({ type: 'power' }))

      const result = useAnnotationStore.getState().getByType('ceiling')
      expect(result).toEqual([])
    })

    it('should work for all annotation types', () => {
      const types: AnnotationType[] = [
        'power', 'parking', 'sound', 'light', 'access', 'ceiling', 'restriction', 'custom',
      ]

      types.forEach((type, i) => {
        useAnnotationStore.getState().addAnnotation(makeAnnotation({ id: `ann-${i}`, type }))
      })

      types.forEach((type) => {
        const results = useAnnotationStore.getState().getByType(type)
        expect(results).toHaveLength(1)
        expect(results[0].type).toBe(type)
      })
    })
  })

  describe('removeAnnotation', () => {
    it('should remove an annotation by id', () => {
      const { addAnnotation } = useAnnotationStore.getState()
      addAnnotation(makeAnnotation({ id: 'ann-1' }))
      addAnnotation(makeAnnotation({ id: 'ann-2' }))

      useAnnotationStore.getState().removeAnnotation('ann-1')

      const { annotations } = useAnnotationStore.getState()
      expect(annotations).toHaveLength(1)
      expect(annotations[0].id).toBe('ann-2')
    })

    it('should clear selectedId if removed annotation was selected', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation({ id: 'ann-1' }))
      useAnnotationStore.getState().setSelectedId('ann-1')
      useAnnotationStore.getState().removeAnnotation('ann-1')

      expect(useAnnotationStore.getState().selectedId).toBeNull()
    })

    it('should not affect selectedId if a different annotation is removed', () => {
      const { addAnnotation } = useAnnotationStore.getState()
      addAnnotation(makeAnnotation({ id: 'ann-1' }))
      addAnnotation(makeAnnotation({ id: 'ann-2' }))
      useAnnotationStore.getState().setSelectedId('ann-1')
      useAnnotationStore.getState().removeAnnotation('ann-2')

      expect(useAnnotationStore.getState().selectedId).toBe('ann-1')
    })

    it('should handle removing non-existent annotation gracefully', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation({ id: 'ann-1' }))
      useAnnotationStore.getState().removeAnnotation('nonexistent')

      expect(useAnnotationStore.getState().annotations).toHaveLength(1)
    })
  })

  describe('updateAnnotation', () => {
    it('should partially update annotation fields', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation({ id: 'ann-1' }))
      useAnnotationStore.getState().updateAnnotation('ann-1', { visibility: 'public' })

      const ann = useAnnotationStore.getState().annotations[0]
      expect(ann.visibility).toBe('public')
      expect(ann.type).toBe('power') // unchanged
    })

    it('should update position', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation({ id: 'ann-1' }))
      useAnnotationStore.getState().updateAnnotation('ann-1', { position: [9, 9, 9] })

      expect(useAnnotationStore.getState().annotations[0].position).toEqual([9, 9, 9])
    })

    it('should update bilingual title', () => {
      useAnnotationStore.getState().addAnnotation(makeAnnotation({ id: 'ann-1' }))
      useAnnotationStore.getState().updateAnnotation('ann-1', {
        title: { en: 'Updated', th: 'อัปเดต' },
      })

      const ann = useAnnotationStore.getState().annotations[0]
      expect(ann.title.en).toBe('Updated')
      expect(ann.title.th).toBe('อัปเดต')
    })
  })

  describe('clearAnnotations', () => {
    it('should remove all annotations', () => {
      const { addAnnotation } = useAnnotationStore.getState()
      addAnnotation(makeAnnotation({ id: 'ann-1' }))
      addAnnotation(makeAnnotation({ id: 'ann-2' }))
      useAnnotationStore.getState().setSelectedId('ann-1')

      useAnnotationStore.getState().clearAnnotations()

      expect(useAnnotationStore.getState().annotations).toEqual([])
      expect(useAnnotationStore.getState().selectedId).toBeNull()
    })
  })

  describe('visibility filtering', () => {
    it('should store and retrieve different visibility levels', () => {
      const { addAnnotation } = useAnnotationStore.getState()
      addAnnotation(makeAnnotation({ id: 'a1', visibility: 'private' }))
      addAnnotation(makeAnnotation({ id: 'a2', visibility: 'team' }))
      addAnnotation(makeAnnotation({ id: 'a3', visibility: 'public' }))

      const { annotations } = useAnnotationStore.getState()
      const publicAnns = annotations.filter((a) => a.visibility === 'public')
      const teamAnns = annotations.filter((a) => a.visibility === 'team')
      const privateAnns = annotations.filter((a) => a.visibility === 'private')

      expect(publicAnns).toHaveLength(1)
      expect(teamAnns).toHaveLength(1)
      expect(privateAnns).toHaveLength(1)
    })
  })
})
