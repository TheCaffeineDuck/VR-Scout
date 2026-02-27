import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { listTours } from '@/lib/firestore/tours'
import type { VirtualTour } from '@/types/scene'

type StatusFilter = 'all' | 'draft' | 'published' | 'archived'

export function PropertyList() {
  const navigate = useNavigate()
  const [tours, setTours] = useState<VirtualTour[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listTours()
      .then((data) => {
        if (!cancelled) {
          setTours(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err))
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let result = tours
    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.locationId.toLowerCase().includes(q) ||
          (t.splatUrls.preview && t.splatUrls.preview.toLowerCase().includes(q))
      )
    }
    return result
  }, [tours, search, statusFilter])

  function formatSize(bytes: number): string {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function relativeTime(date: Date): string {
    const now = Date.now()
    const d = date instanceof Date ? date : new Date(date)
    const diff = now - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return d.toLocaleDateString()
  }

  function qcSummary(tour: VirtualTour): string {
    const qc = tour.qcChecklist
    if (!qc) return 'Not started'
    const items = [
      qc.noArtifacts, qc.fullCoverage, qc.accurateLighting, qc.calibratedScale,
      qc.fileSizeOk, qc.lodGenerated, qc.viewpointsMarked, qc.annotationsAdded,
    ]
    const passed = items.filter(Boolean).length
    return `${passed}/8 passed`
  }

  function lodIndicators(tour: VirtualTour) {
    const urls = tour.splatUrls
    return (
      <div className="flex gap-1.5 text-xs">
        <span className={urls?.preview ? 'text-green-400' : 'text-gray-600'} title="Preview LOD">
          P{urls?.preview ? '\u2713' : '\u2717'}
        </span>
        <span className={urls?.medium ? 'text-green-400' : 'text-gray-600'} title="Medium LOD">
          M{urls?.medium ? '\u2713' : '\u2717'}
        </span>
        <span className={urls?.high ? 'text-green-400' : 'text-gray-600'} title="High LOD">
          H{urls?.high ? '\u2713' : '\u2717'}
        </span>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Properties</h1>
        <button
          onClick={() => navigate('/admin/properties/new')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
        >
          + Add Property
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or location ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Content */}
      {loading && <p className="text-gray-500 text-sm">Loading properties...</p>}
      {error && <p className="text-red-400 text-sm">Error: {error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">
            {tours.length === 0
              ? 'No properties yet. Click "Add Property" to create one.'
              : 'No properties match your filters.'}
          </p>
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-2 pr-4 font-medium">Location ID</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Scene Files</th>
                <th className="pb-2 pr-4 font-medium">Splats</th>
                <th className="pb-2 pr-4 font-medium">Size</th>
                <th className="pb-2 pr-4 font-medium">QC</th>
                <th className="pb-2 pr-4 font-medium">Updated</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tour) => (
                <tr key={tour.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-2.5 pr-4 font-mono text-xs">{tour.locationId}</td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={tour.status} />
                  </td>
                  <td className="py-2.5 pr-4">{lodIndicators(tour)}</td>
                  <td className="py-2.5 pr-4 text-gray-400 text-xs">
                    {tour.splatCount ? tour.splatCount.toLocaleString() : '-'}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-400 text-xs">
                    {formatSize(tour.fileSize)}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-400 text-xs">{qcSummary(tour)}</td>
                  <td className="py-2.5 pr-4 text-gray-500 text-xs">
                    {relativeTime(tour.updatedAt)}
                  </td>
                  <td className="py-2.5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/admin/properties/${tour.id}`)}
                        className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => window.open(`/scout/${tour.locationId}`, '_blank')}
                        className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                      >
                        Preview
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-700 text-gray-300',
    published: 'bg-green-900/50 text-green-400',
    archived: 'bg-red-900/50 text-red-400',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.draft}`}>
      {status}
    </span>
  )
}
