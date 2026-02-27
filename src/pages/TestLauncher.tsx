import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listTours } from '@/lib/firestore/tours'
import { JoinSessionInput } from '@/components/collaboration/JoinSessionInput'
import type { VirtualTour } from '@/types/scene'

/** Hardcoded local scenes for development when no tours exist in storage */
const LOCAL_SCENES: Array<{
  id: string
  name: string
  locationId: string
  splatCount: string
  fileSize: string
  status: 'draft' | 'published' | 'archived'
  splatUrls: { preview: string; medium: string; high: string }
}> = [
  {
    id: 'room',
    name: 'Room',
    locationId: 'room',
    splatCount: '973K',
    fileSize: '11.5 MB',
    status: 'published',
    splatUrls: {
      preview: '/scenes/room_preview.spz',
      medium: '/scenes/room_medium.spz',
      high: '/scenes/room_high.spz',
    },
  },
  {
    id: 'garden',
    name: 'Garden',
    locationId: 'garden',
    splatCount: '1.6M',
    fileSize: '21.5 MB',
    status: 'published',
    splatUrls: {
      preview: '/scenes/garden_preview.spz',
      medium: '/scenes/garden_medium.spz',
      high: '/scenes/garden_high.spz',
    },
  },
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSplatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`
  return `${count}`
}

export function TestLauncher() {
  const navigate = useNavigate()
  const [tours, setTours] = useState<VirtualTour[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listTours()
      .then(setTours)
      .catch(() => setTours([]))
      .finally(() => setLoading(false))
  }, [])

  const hasTours = tours.length > 0

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">VR Scout</h1>
          <p className="text-gray-400 text-sm mt-1">
            Development Test Launcher &mdash; this page is replaced by
            locationbird.com in production
          </p>
        </div>

        {/* Join Session by Code */}
        <section className="mb-8 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3 text-gray-300">
            Join a Session
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Enter a 6-character session code to join a collaborative scouting session.
          </p>
          <JoinSessionInput />
        </section>

        {/* Firestore tours */}
        {loading ? (
          <div className="flex items-center gap-3 text-gray-400 text-sm py-8">
            <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            Loading tours...
          </div>
        ) : hasTours ? (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Tours</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tours.map((tour) => (
                <TourCard
                  key={tour.id}
                  name={tour.locationId || tour.id}
                  locationId={tour.locationId || tour.id}
                  splatCount={formatSplatCount(tour.splatCount)}
                  fileSize={formatFileSize(tour.fileSize)}
                  status={tour.status}
                  onScout={() =>
                    navigate(`/scout/${tour.locationId || tour.id}`)
                  }
                  onScoutWithSession={() =>
                    navigate(
                      `/scout/${tour.locationId || tour.id}?session=new`,
                    )
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Local dev scenes */}
        <section>
          <h2 className="text-lg font-semibold mb-4">
            {hasTours ? 'Local Test Scenes' : 'Available Scenes'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LOCAL_SCENES.map((scene) => (
              <TourCard
                key={scene.id}
                name={scene.name}
                locationId={scene.locationId}
                splatCount={scene.splatCount}
                fileSize={scene.fileSize}
                status={scene.status}
                onScout={() => navigate(`/scout/${scene.locationId}`)}
                onScoutWithSession={() =>
                  navigate(`/scout/${scene.locationId}?session=new`)
                }
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function TourCard({
  name,
  locationId,
  splatCount,
  fileSize,
  status,
  onScout,
  onScoutWithSession,
}: {
  name: string
  locationId: string
  splatCount: string
  fileSize: string
  status: 'draft' | 'published' | 'archived'
  onScout: () => void
  onScoutWithSession: () => void
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
      {/* Thumbnail placeholder */}
      <div className="bg-gray-800 rounded-lg h-32 mb-3 flex items-center justify-center text-gray-600 text-sm">
        {name}
      </div>

      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">{name}</h3>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            status === 'published'
              ? 'bg-green-900/50 text-green-400'
              : 'bg-amber-900/50 text-amber-400'
          }`}
        >
          {status}
        </span>
      </div>

      <div className="flex gap-3 text-xs text-gray-500 mb-4">
        <span>{splatCount} splats</span>
        <span>{fileSize}</span>
      </div>

      <div className="mt-auto flex gap-2">
        <button
          onClick={onScout}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-medium transition-colors"
        >
          Scout
        </button>
        <button
          onClick={onScoutWithSession}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-xs font-medium transition-colors"
        >
          Scout + Session
        </button>
      </div>
    </div>
  )
}
