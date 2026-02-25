import { describe, it, expect, beforeEach } from 'vitest'
import { useToolStore } from '@/stores/tool-store'

describe('tool-store', () => {
  beforeEach(() => {
    useToolStore.setState({
      activeTool: 'navigate',
      measurementUnit: 'meters',
      laserActive: false,
      sunTime: 0.5,
      sunDate: new Date(2025, 0, 1),
    })
  })

  it('has navigate as default tool', () => {
    expect(useToolStore.getState().activeTool).toBe('navigate')
  })

  it('switches active tool', () => {
    useToolStore.getState().setActiveTool('measure')
    expect(useToolStore.getState().activeTool).toBe('measure')
  })

  it('cycles through all tools', () => {
    const tools = ['navigate', 'measure', 'annotate', 'camera', 'screenshot', 'sunpath', 'floorplan', 'laser', 'compare'] as const
    for (const tool of tools) {
      useToolStore.getState().setActiveTool(tool)
      expect(useToolStore.getState().activeTool).toBe(tool)
    }
  })

  it('toggles measurement unit', () => {
    expect(useToolStore.getState().measurementUnit).toBe('meters')
    useToolStore.getState().setMeasurementUnit('feet')
    expect(useToolStore.getState().measurementUnit).toBe('feet')
    useToolStore.getState().setMeasurementUnit('meters')
    expect(useToolStore.getState().measurementUnit).toBe('meters')
  })

  it('manages laser active state', () => {
    expect(useToolStore.getState().laserActive).toBe(false)
    useToolStore.getState().setLaserActive(true)
    expect(useToolStore.getState().laserActive).toBe(true)
  })

  it('sets sun time (0-1 range)', () => {
    useToolStore.getState().setSunTime(0.0)
    expect(useToolStore.getState().sunTime).toBe(0.0)
    useToolStore.getState().setSunTime(1.0)
    expect(useToolStore.getState().sunTime).toBe(1.0)
    useToolStore.getState().setSunTime(0.75)
    expect(useToolStore.getState().sunTime).toBe(0.75)
  })

  it('sets sun date', () => {
    const date = new Date(2025, 5, 21) // Summer solstice
    useToolStore.getState().setSunDate(date)
    expect(useToolStore.getState().sunDate).toEqual(date)
  })
})
