import { create } from 'zustand'
import type * as THREE from 'three'
import type { SceneLOD } from '@/types/scene'

export type LODLevel = 'preview' | 'medium' | 'high'

export type EnvironmentPreset =
  | 'apartment' | 'city' | 'dawn' | 'forest' | 'lobby'
  | 'night' | 'park' | 'studio' | 'sunset' | 'warehouse'
  | 'neutral'

export interface ViewerState {
  // Scene
  sceneUrl: string | null
  sceneLOD: SceneLOD | null
  currentLOD: LODLevel
  sceneGroup: THREE.Group | null
  sceneBounds: { min: [number, number, number]; max: [number, number, number] } | null
  spawnPoint: { position: [number, number, number]; rotation: [number, number, number] }

  // Loading
  loading: boolean
  loadProgress: number
  loadStage: string

  // Error
  error: string | null

  // Environment
  environmentPreset: EnvironmentPreset
  ambientIntensity: number
  directionalIntensity: number
  fogDistance: number
  showBackground: boolean
  showGrid: boolean

  // Stats
  showStats: boolean

  // Actions
  setSceneUrl: (url: string | null) => void
  setSceneLOD: (lod: SceneLOD | null) => void
  setCurrentLOD: (level: LODLevel) => void
  setSceneGroup: (group: THREE.Group | null) => void
  setSceneBounds: (bounds: { min: [number, number, number]; max: [number, number, number] } | null) => void
  setSpawnPoint: (spawn: { position: [number, number, number]; rotation: [number, number, number] }) => void
  setLoading: (loading: boolean) => void
  setLoadProgress: (progress: number) => void
  setLoadStage: (stage: string) => void
  setError: (error: string | null) => void
  setEnvironmentPreset: (preset: EnvironmentPreset) => void
  setAmbientIntensity: (value: number) => void
  setDirectionalIntensity: (value: number) => void
  setFogDistance: (value: number) => void
  setShowBackground: (show: boolean) => void
  setShowGrid: (show: boolean) => void
  setShowStats: (show: boolean) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  sceneUrl: null,
  sceneLOD: null,
  currentLOD: 'preview',
  sceneGroup: null,
  sceneBounds: null,
  spawnPoint: { position: [0, 1.6, 5], rotation: [0, 0, 0] },

  loading: false,
  loadProgress: 0,
  loadStage: '',

  error: null,

  environmentPreset: 'studio',
  ambientIntensity: 0.5,
  directionalIntensity: 1.0,
  fogDistance: 100,
  showBackground: true,
  showGrid: true,

  showStats: false,

  setSceneUrl: (url) => set({ sceneUrl: url }),
  setSceneLOD: (lod) => set({ sceneLOD: lod }),
  setCurrentLOD: (level) => set({ currentLOD: level }),
  setSceneGroup: (group) => set({ sceneGroup: group }),
  setSceneBounds: (bounds) => set({ sceneBounds: bounds }),
  setSpawnPoint: (spawn) => set({ spawnPoint: spawn }),
  setLoading: (loading) => set({ loading }),
  setLoadProgress: (progress) => set({ loadProgress: progress }),
  setLoadStage: (stage) => set({ loadStage: stage }),
  setError: (error) => set({ error }),
  setEnvironmentPreset: (preset) => set({ environmentPreset: preset }),
  setAmbientIntensity: (value) => set({ ambientIntensity: value }),
  setDirectionalIntensity: (value) => set({ directionalIntensity: value }),
  setFogDistance: (value) => set({ fogDistance: value }),
  setShowBackground: (show) => set({ showBackground: show }),
  setShowGrid: (show) => set({ showGrid: show }),
  setShowStats: (show) => set({ showStats: show }),
}))
