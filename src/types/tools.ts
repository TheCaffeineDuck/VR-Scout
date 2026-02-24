export type ToolType = 'navigate' | 'measure' | 'annotate' | 'camera' | 'screenshot' | 'sunpath' | 'floorplan' | 'laser' | 'compare'

export interface ToolState {
  activeTool: ToolType
  measurementUnit: 'meters' | 'feet'
  laserActive: boolean
  sunTime: number
  sunDate: Date
}
