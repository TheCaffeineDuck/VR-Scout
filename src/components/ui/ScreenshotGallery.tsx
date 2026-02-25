import { useEffect, useState } from 'react'
import {
  listAllScreenshots,
  deleteScreenshot,
  type ScreenshotRecord,
} from '@/lib/firestore/screenshots'
import { downloadDataUrl } from '@/lib/screenshot'

export function ScreenshotGallery({
  onClose,
}: {
  onClose: () => void
}) {
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ScreenshotRecord | null>(null)

  useEffect(() => {
    loadScreenshots()
  }, [])

  async function loadScreenshots() {
    setLoading(true)
    const list = await listAllScreenshots()
    setScreenshots(list)
    setLoading(false)
  }

  async function handleDelete(id: string) {
    await deleteScreenshot(id)
    setScreenshots((s) => s.filter((sc) => sc.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-white font-semibold text-sm">
            Screenshot Gallery ({screenshots.length})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">
              Loading screenshots...
            </p>
          ) : screenshots.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">
              No screenshots captured yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {screenshots.map((sc) => (
                <div
                  key={sc.id}
                  className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                    selected?.id === sc.id
                      ? 'border-indigo-500'
                      : 'border-transparent hover:border-gray-600'
                  }`}
                  onClick={() => setSelected(sc)}
                >
                  <img
                    src={sc.url}
                    alt={sc.filename}
                    className="w-full aspect-video object-cover bg-gray-800"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                    <p className="text-white text-[10px] truncate">
                      {sc.filename}
                    </p>
                    <p className="text-gray-300 text-[9px]">
                      {sc.lensMm}mm
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="border-t border-gray-700 px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs truncate">
                {selected.filename}
              </p>
              <p className="text-gray-400 text-[10px]">
                {selected.lensMm}mm | Pos: [{selected.cameraPosition.map((v) => v.toFixed(1)).join(', ')}]
                {' | '}
                {new Date(selected.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => downloadDataUrl(selected.url, selected.filename)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs"
            >
              Download
            </button>
            <button
              onClick={() => handleDelete(selected.id)}
              className="bg-red-600/30 hover:bg-red-600/50 text-red-300 px-3 py-1 rounded text-xs"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
