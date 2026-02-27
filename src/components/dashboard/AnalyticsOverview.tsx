import { useEffect, useState } from 'react'
import { listTours } from '@/lib/firestore/tours'
import { listScreenshots } from '@/lib/firestore/screenshots'
import type { VirtualTour } from '@/types/scene'
import type { ScreenshotRecord } from '@/lib/firestore/screenshots'

interface Stats {
  totalTours: number
  publishedTours: number
  draftTours: number
  totalSplats: number
  totalScreenshots: number
  totalSizeMb: number
}

export function AnalyticsOverview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const tours = await listTours()

        // Aggregate screenshots across all tours
        const screenshotResults = await Promise.all(
          tours.map((t: VirtualTour) => listScreenshots(t.id).catch(() => [] as ScreenshotRecord[]))
        )
        const screenshots = screenshotResults.flat()

        setStats({
          totalTours: tours.length,
          publishedTours: tours.filter((t: VirtualTour) => t.status === 'published').length,
          draftTours: tours.filter((t: VirtualTour) => t.status === 'draft').length,
          totalSplats: tours.reduce((sum: number, t: VirtualTour) => sum + t.splatCount, 0),
          totalScreenshots: screenshots.length,
          totalSizeMb: tours.reduce((sum: number, t: VirtualTour) => sum + t.fileSize, 0) / (1024 * 1024),
        })
      } catch (err) {
        console.error('[Analytics] Failed to load:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        Failed to load analytics
      </div>
    )
  }

  const cards: { label: string; value: string; sub?: string }[] = [
    { label: 'Total Tours', value: stats.totalTours.toString() },
    { label: 'Published', value: stats.publishedTours.toString(), sub: `${stats.draftTours} drafts` },
    { label: 'Total Splats', value: stats.totalSplats > 1_000_000
      ? `${(stats.totalSplats / 1_000_000).toFixed(1)}M`
      : stats.totalSplats.toLocaleString()
    },
    { label: 'Screenshots', value: stats.totalScreenshots.toString() },
    { label: 'Total Size', value: `${stats.totalSizeMb.toFixed(1)} MB` },
  ]

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-400 mb-4">Overview</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-gray-800 border border-gray-700 rounded-lg p-3"
          >
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="text-xl font-bold text-white mt-1">{card.value}</p>
            {card.sub && <p className="text-[10px] text-gray-500 mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-center text-xs text-gray-500">
        Detailed analytics (views per tour, session duration, heatmaps) will be available in a future update.
      </div>
    </div>
  )
}
