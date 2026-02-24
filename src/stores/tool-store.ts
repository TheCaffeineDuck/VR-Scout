import { create } from 'zustand'
import type { ToolType } from '@/types/tools'

export interface ToolStoreState {
  activeTool: ToolType
  measurementUnit: 'meters' | 'feet'
  laserActive: boolean
  sunTime: number
  sunDate: Date

  setActiveTool: (tool: ToolType) => void
  setMeasurementUnit: (unit: 'meters' | 'feet') => void
  setLaserActive: (active: boolean) => void
  setSunTime: (time: number) => void
  setSunDate: (date: Date) => void
}

export const useToolStore = create<ToolStoreState>((set) => ({
  activeTool: 'navigate',
  measurementUnit: 'meters',
  laserActive: false,
  sunTime: 0.5,
  sunDate: new Date(),

  setActiveTool: (tool) => set({ activeTool: tool }),
  setMeasurementUnit: (unit) => set({ measurementUnit: unit }),
  setLaserActive: (active) => set({ laserActive: active }),
  setSunTime: (time) => set({ sunTime: time }),
  setSunDate: (date) => set({ sunDate: date }),
}))
