import { describe, it, expect, beforeEach } from 'vitest'
import { useMeasurementStore, type MeasurementLine } from '@/hooks/useMeasurement'

function makeMeasurement(overrides: Partial<MeasurementLine> = {}): MeasurementLine {
  return {
    id: 'meas-1',
    start: [0, 0, 0],
    end: [3, 4, 0],
    distance: 5.0,
    ...overrides,
  }
}

describe('measurement-store', () => {
  beforeEach(() => {
    useMeasurementStore.setState({
      measurements: [],
      pendingStart: null,
    })
  })

  describe('addMeasurement', () => {
    it('should add a measurement line to the array', () => {
      useMeasurementStore.getState().addMeasurement(makeMeasurement())

      const { measurements } = useMeasurementStore.getState()
      expect(measurements).toHaveLength(1)
      expect(measurements[0].id).toBe('meas-1')
    })

    it('should preserve start and end points', () => {
      useMeasurementStore.getState().addMeasurement(
        makeMeasurement({ start: [1, 2, 3], end: [4, 5, 6] })
      )

      const line = useMeasurementStore.getState().measurements[0]
      expect(line.start).toEqual([1, 2, 3])
      expect(line.end).toEqual([4, 5, 6])
    })

    it('should store correct distance for known coordinates', () => {
      // 3-4-5 right triangle
      const dist = Math.sqrt(3 ** 2 + 4 ** 2 + 0 ** 2)
      useMeasurementStore.getState().addMeasurement(
        makeMeasurement({ start: [0, 0, 0], end: [3, 4, 0], distance: dist })
      )

      expect(useMeasurementStore.getState().measurements[0].distance).toBeCloseTo(5.0)
    })

    it('should accumulate multiple measurements', () => {
      const { addMeasurement } = useMeasurementStore.getState()
      addMeasurement(makeMeasurement({ id: 'm1', distance: 2.5 }))
      addMeasurement(makeMeasurement({ id: 'm2', distance: 3.0 }))
      addMeasurement(makeMeasurement({ id: 'm3', distance: 7.5 }))

      expect(useMeasurementStore.getState().measurements).toHaveLength(3)
    })

    it('should calculate 3D distance correctly for diagonal', () => {
      // Distance from [0,0,0] to [1,1,1] = sqrt(3) ≈ 1.732
      const dist = Math.sqrt(1 + 1 + 1)
      useMeasurementStore.getState().addMeasurement(
        makeMeasurement({
          id: 'diag',
          start: [0, 0, 0],
          end: [1, 1, 1],
          distance: dist,
        })
      )

      expect(useMeasurementStore.getState().measurements[0].distance).toBeCloseTo(1.732, 2)
    })
  })

  describe('removeMeasurement', () => {
    it('should remove a measurement by ID', () => {
      const { addMeasurement } = useMeasurementStore.getState()
      addMeasurement(makeMeasurement({ id: 'm1' }))
      addMeasurement(makeMeasurement({ id: 'm2' }))

      useMeasurementStore.getState().removeMeasurement('m1')

      const { measurements } = useMeasurementStore.getState()
      expect(measurements).toHaveLength(1)
      expect(measurements[0].id).toBe('m2')
    })

    it('should handle removing non-existent ID gracefully', () => {
      useMeasurementStore.getState().addMeasurement(makeMeasurement({ id: 'm1' }))
      useMeasurementStore.getState().removeMeasurement('nonexistent')

      expect(useMeasurementStore.getState().measurements).toHaveLength(1)
    })
  })

  describe('clearMeasurements', () => {
    it('should remove all measurements', () => {
      const { addMeasurement } = useMeasurementStore.getState()
      addMeasurement(makeMeasurement({ id: 'm1' }))
      addMeasurement(makeMeasurement({ id: 'm2' }))

      useMeasurementStore.getState().clearMeasurements()

      expect(useMeasurementStore.getState().measurements).toEqual([])
    })

    it('should also clear pendingStart', () => {
      useMeasurementStore.getState().setPendingStart([1, 2, 3])
      useMeasurementStore.getState().clearMeasurements()

      expect(useMeasurementStore.getState().pendingStart).toBeNull()
    })
  })

  describe('setPendingStart', () => {
    it('should set the pending start point', () => {
      useMeasurementStore.getState().setPendingStart([5, 10, 15])
      expect(useMeasurementStore.getState().pendingStart).toEqual([5, 10, 15])
    })

    it('should clear pending start with null', () => {
      useMeasurementStore.getState().setPendingStart([1, 2, 3])
      useMeasurementStore.getState().setPendingStart(null)
      expect(useMeasurementStore.getState().pendingStart).toBeNull()
    })

    it('should overwrite previous pending start', () => {
      useMeasurementStore.getState().setPendingStart([1, 1, 1])
      useMeasurementStore.getState().setPendingStart([9, 9, 9])
      expect(useMeasurementStore.getState().pendingStart).toEqual([9, 9, 9])
    })
  })

  describe('initial state', () => {
    it('should start with empty measurements', () => {
      expect(useMeasurementStore.getState().measurements).toEqual([])
    })

    it('should start with null pendingStart', () => {
      expect(useMeasurementStore.getState().pendingStart).toBeNull()
    })
  })
})
