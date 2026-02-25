import { CINEMA_LENSES } from '@/types/camera'
import { useVirtualCameraStore } from '@/hooks/useVirtualCamera'

/**
 * HTML overlay showing lens options for the active virtual camera.
 * Rendered as a simple list for desktop; radial VR version comes later.
 */
export function LensRadialMenu() {
  const activeCameraId = useVirtualCameraStore((s) => s.activeCameraId)
  const cameras = useVirtualCameraStore((s) => s.cameras)
  const setLens = useVirtualCameraStore((s) => s.setLens)

  if (!activeCameraId) return null
  const cam = cameras.find((c) => c.id === activeCameraId)
  if (!cam) return null

  return (
    <div className="fixed left-4 bottom-20 z-50 bg-gray-900/95 rounded-xl p-2 shadow-xl">
      <div className="text-[10px] text-gray-400 px-2 mb-1">Lens</div>
      <div className="flex flex-col gap-0.5">
        {CINEMA_LENSES.map((lens, i) => (
          <button
            key={lens.focalLength}
            onClick={() => setLens(activeCameraId, i)}
            className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
              cam.lensIndex === i
                ? 'bg-indigo-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            {lens.focalLength}mm — {lens.name}
          </button>
        ))}
      </div>
    </div>
  )
}
