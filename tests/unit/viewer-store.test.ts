import { describe, it, expect, beforeEach } from 'vitest'
import { useViewerStore } from '@/stores/viewer-store'

describe('viewer-store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useViewerStore.setState({
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
    })
  })

  it('has correct default values', () => {
    const state = useViewerStore.getState()
    expect(state.sceneUrl).toBeNull()
    expect(state.sceneLOD).toBeNull()
    expect(state.currentLOD).toBe('preview')
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.environmentPreset).toBe('studio')
    expect(state.ambientIntensity).toBe(0.5)
    expect(state.showStats).toBe(false)
  })

  it('sets scene URL', () => {
    useViewerStore.getState().setSceneUrl('/scenes/test.glb')
    expect(useViewerStore.getState().sceneUrl).toBe('/scenes/test.glb')
  })

  it('sets scene LOD', () => {
    const lod = {
      preview: '/p.glb',
      medium: '/m.glb',
      high: '/h.glb',
    }
    useViewerStore.getState().setSceneLOD(lod)
    expect(useViewerStore.getState().sceneLOD).toEqual(lod)
  })

  it('updates current LOD level', () => {
    useViewerStore.getState().setCurrentLOD('high')
    expect(useViewerStore.getState().currentLOD).toBe('high')
  })

  it('manages loading state', () => {
    const { setLoading, setLoadProgress, setLoadStage } = useViewerStore.getState()
    setLoading(true)
    setLoadProgress(0.5)
    setLoadStage('Loading high quality...')

    const state = useViewerStore.getState()
    expect(state.loading).toBe(true)
    expect(state.loadProgress).toBe(0.5)
    expect(state.loadStage).toBe('Loading high quality...')
  })

  it('manages error state', () => {
    useViewerStore.getState().setError('Load failed')
    expect(useViewerStore.getState().error).toBe('Load failed')

    useViewerStore.getState().setError(null)
    expect(useViewerStore.getState().error).toBeNull()
  })

  it('updates environment settings', () => {
    const state = useViewerStore.getState()
    state.setEnvironmentPreset('dawn')
    state.setAmbientIntensity(1.5)
    state.setDirectionalIntensity(2.0)
    state.setFogDistance(50)
    state.setShowBackground(false)
    state.setShowGrid(false)

    const updated = useViewerStore.getState()
    expect(updated.environmentPreset).toBe('dawn')
    expect(updated.ambientIntensity).toBe(1.5)
    expect(updated.directionalIntensity).toBe(2.0)
    expect(updated.fogDistance).toBe(50)
    expect(updated.showBackground).toBe(false)
    expect(updated.showGrid).toBe(false)
  })

  it('sets spawn point', () => {
    useViewerStore.getState().setSpawnPoint({
      position: [1, 2, 3],
      rotation: [0, Math.PI, 0],
    })
    const { spawnPoint } = useViewerStore.getState()
    expect(spawnPoint.position).toEqual([1, 2, 3])
    expect(spawnPoint.rotation).toEqual([0, Math.PI, 0])
  })

  it('toggles stats visibility', () => {
    useViewerStore.getState().setShowStats(true)
    expect(useViewerStore.getState().showStats).toBe(true)
    useViewerStore.getState().setShowStats(false)
    expect(useViewerStore.getState().showStats).toBe(false)
  })
})
