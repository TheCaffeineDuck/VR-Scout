import { useViewerStore } from '@/stores/viewer-store'

export function LoadingOverlay() {
  const loading = useViewerStore((s) => s.loading)
  const progress = useViewerStore((s) => s.loadProgress)
  const stage = useViewerStore((s) => s.loadStage)
  const currentLOD = useViewerStore((s) => s.currentLOD)
  const sceneLOD = useViewerStore((s) => s.sceneLOD)

  if (!loading) return null

  const percent = Math.round(progress * 100)
  const isProgressive = sceneLOD !== null
  const lodLabel = currentLOD === 'preview' ? 'Preview' : currentLOD === 'medium' ? 'Medium' : 'High'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="text-center text-white space-y-4">
        <h2 className="text-xl font-semibold">Loading Scene</h2>
        <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-sm text-gray-400">
          {stage} {percent > 0 && `(${percent}%)`}
        </p>
        {isProgressive && (
          <p className="text-xs text-gray-500">
            Current quality: {lodLabel}
          </p>
        )}
      </div>
    </div>
  )
}
