import { useState } from 'react'
import { TourList } from './TourList'
import { TourEditor } from './TourEditor'
import { AnalyticsOverview } from './AnalyticsOverview'
import type { VirtualTour } from '@/types/scene'

type DashboardView = 'tours' | 'editor' | 'analytics'

interface DashboardProps {
  onClose: () => void
  onLoadTour?: (tour: VirtualTour) => void
}

export function Dashboard({ onClose, onLoadTour }: DashboardProps) {
  const [view, setView] = useState<DashboardView>('tours')
  const [editingTour, setEditingTour] = useState<VirtualTour | null>(null)

  function handleEditTour(tour: VirtualTour) {
    setEditingTour(tour)
    setView('editor')
  }

  function handleNewTour() {
    setEditingTour(null)
    setView('editor')
  }

  function handleEditorClose() {
    setEditingTour(null)
    setView('tours')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header with tabs */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-white">Dashboard</h2>
            <nav className="flex gap-1">
              {([
                ['tours', 'Tours'],
                ['analytics', 'Analytics'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    view === key
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === 'tours' && (
            <TourList
              onEdit={handleEditTour}
              onNew={handleNewTour}
              onLoad={onLoadTour}
            />
          )}
          {view === 'editor' && (
            <TourEditor
              tour={editingTour}
              onClose={handleEditorClose}
            />
          )}
          {view === 'analytics' && <AnalyticsOverview />}
        </div>
      </div>
    </div>
  )
}
