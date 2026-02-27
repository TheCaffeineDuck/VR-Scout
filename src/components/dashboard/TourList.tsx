import { useEffect, useState } from 'react'
import { listTours, deleteTour } from '@/lib/firestore/tours'
import type { VirtualTour } from '@/types/scene'

interface TourListProps {
  onEdit: (tour: VirtualTour) => void
  onNew: () => void
  onLoad?: (tour: VirtualTour) => void
}

export function TourList({ onEdit, onNew, onLoad }: TourListProps) {
  const [tours, setTours] = useState<VirtualTour[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const result = await listTours()
      setTours(result)
    } catch (err) {
      console.error('[Dashboard] Failed to load tours:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(tour: VirtualTour) {
    if (!confirm(`Delete "${tour.id}"? This cannot be undone.`)) return
    setDeleting(tour.id)
    try {
      await deleteTour(tour.id)
      setTours((t) => t.filter((x) => x.id !== tour.id))
    } catch (err) {
      console.error('[Dashboard] Failed to delete tour:', err)
    } finally {
      setDeleting(null)
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function qcProgress(tour: VirtualTour): { done: number; total: number } {
    const qc = tour.qcChecklist
    const checks = [
      qc.noArtifacts, qc.fullCoverage, qc.accurateLighting,
      qc.calibratedScale, qc.fileSizeOk, qc.lodGenerated,
      qc.viewpointsMarked, qc.annotationsAdded,
    ]
    return { done: checks.filter(Boolean).length, total: checks.length }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-400">{tours.length} tour{tours.length !== 1 ? 's' : ''}</p>
        <button
          onClick={onNew}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium text-xs"
        >
          + New Tour
        </button>
      </div>

      {tours.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm mb-2">No tours yet</p>
          <p className="text-xs">Create your first tour to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tours.map((tour) => {
            const qc = qcProgress(tour)
            return (
              <div
                key={tour.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3"
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {tour.id}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      tour.status === 'published'
                        ? 'bg-green-900/50 text-green-400 border border-green-800'
                        : 'bg-gray-700 text-gray-400 border border-gray-600'
                    }`}>
                      {tour.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{tour.splatCount.toLocaleString()} splats</span>
                    <span>{formatSize(tour.fileSize)}</span>
                    <span>QC: {qc.done}/{qc.total}</span>
                    <span>{new Date(tour.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {onLoad && (
                    <button
                      onClick={() => onLoad(tour)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded"
                      title="Load in viewer"
                    >
                      View
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(tour)}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(tour)}
                    disabled={deleting === tour.id}
                    className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded disabled:opacity-50"
                  >
                    {deleting === tour.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
