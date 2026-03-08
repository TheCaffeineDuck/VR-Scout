import { useState } from 'react'
import { useViewerStore } from '@/stores/viewer-store'
import type { SceneLOD } from '@/types/scene'

interface SceneEntry {
  id: string
  name: string
  splatCount: string
  fileSize: string
  lod: SceneLOD
}

// Hardcoded local scenes — will connect to Firestore in Phase 5
const LOCAL_SCENES: SceneEntry[] = [
  {
    id: 'outdoor_rooftop',
    name: 'Outdoor Rooftop',
    splatCount: '1.13M',
    fileSize: '71 MB',
    lod: {
      high: '/scenes/outdoor_rooftop.spz',
    },
  },
  {
    id: 'room',
    name: 'Room',
    splatCount: '973K',
    fileSize: '11.5 MB',
    lod: {
      high: '/scenes/room.spz',
    },
  },
  {
    id: 'garden',
    name: 'Garden',
    splatCount: '1.6M',
    fileSize: '21.5 MB',
    lod: {
      high: '/scenes/garden.spz',
    },
  },
  {
    id: 'indoor_library',
    name: 'Indoor Library',
    splatCount: '1.13M',
    fileSize: '70 MB',
    lod: {
      high: '/scenes/indoor_library.spz',
    },
  },
]

export function SceneSelector() {
  const [open, setOpen] = useState(false)
  const setSceneLOD = useViewerStore((s) => s.setSceneLOD)
  const setSceneUrl = useViewerStore((s) => s.setSceneUrl)
  const loading = useViewerStore((s) => s.loading)
  const currentLOD = useViewerStore((s) => s.currentLOD)

  const [activeSceneId, setActiveSceneId] = useState<string | null>('outdoor_rooftop')

  function loadScene(scene: SceneEntry) {
    if (loading) return
    setSceneUrl(null)
    setActiveSceneId(scene.id)
    setSceneLOD(scene.lod)
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 bg-gray-800/90 hover:bg-gray-700/90 text-white px-3 py-2 rounded-lg text-sm font-medium backdrop-blur-sm"
      >
        Scenes
      </button>

      {open && (
        <div className="fixed top-14 left-4 z-50 w-72 bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-gray-700/50 overflow-hidden">
          <div className="p-3 border-b border-gray-700/50">
            <h3 className="text-sm font-semibold text-white">Available Scenes</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              LOD: {currentLOD}
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {LOCAL_SCENES.map((scene) => {
              const isActive = scene.id === activeSceneId
              return (
                <button
                  key={scene.id}
                  onClick={() => loadScene(scene)}
                  disabled={loading}
                  className={`w-full text-left p-3 border-b border-gray-800/50 transition-colors ${
                    isActive
                      ? 'bg-indigo-600/20 border-l-2 border-l-indigo-500'
                      : 'hover:bg-gray-800/50'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="text-sm font-medium text-white">{scene.name}</div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>{scene.splatCount} splats</span>
                    <span>{scene.fileSize}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
