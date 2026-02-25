import { create } from 'zustand'

export interface MeasurementLine {
  id: string
  start: [number, number, number]
  end: [number, number, number]
  distance: number
}

interface MeasurementState {
  measurements: MeasurementLine[]
  pendingStart: [number, number, number] | null

  setPendingStart: (point: [number, number, number] | null) => void
  addMeasurement: (line: MeasurementLine) => void
  removeMeasurement: (id: string) => void
  clearMeasurements: () => void
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  measurements: [],
  pendingStart: null,

  setPendingStart: (point) => set({ pendingStart: point }),
  addMeasurement: (line) =>
    set((s) => ({ measurements: [...s.measurements, line] })),
  removeMeasurement: (id) =>
    set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
  clearMeasurements: () => set({ measurements: [], pendingStart: null }),
}))
