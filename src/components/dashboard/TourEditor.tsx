import { useState, useRef, useCallback } from 'react'
import type { VirtualTour, QCChecklist } from '@/types/scene'
import { createTour, updateTour, updateQCChecklist, publishTour } from '@/lib/firestore/tours'
import { uploadMesh, type UploadProgress } from '@/lib/r2-upload'

interface TourEditorProps {
  tour: VirtualTour | null // null = new tour
  onClose: () => void
}

const QC_LABELS: Record<keyof QCChecklist, string> = {
  noArtifacts: 'No floating artifacts',
  fullCoverage: 'Full spatial coverage',
  accurateLighting: 'Accurate lighting / natural colors',
  calibratedScale: 'Calibrated scale',
  fileSizeOk: 'File size within targets',
  lodGenerated: 'LOD versions generated',
  viewpointsMarked: 'Key viewpoints marked',
  annotationsAdded: 'Production annotations added',
}

const DEFAULT_QC: QCChecklist = {
  noArtifacts: false,
  fullCoverage: false,
  accurateLighting: false,
  calibratedScale: false,
  fileSizeOk: false,
  lodGenerated: false,
  viewpointsMarked: false,
  annotationsAdded: false,
}

export function TourEditor({ tour, onClose }: TourEditorProps) {
  const isNew = !tour
  const [locationId, setLocationId] = useState(tour?.locationId || '')
  const [gpsLat, setGpsLat] = useState(tour?.gps.lat.toString() || '')
  const [gpsLng, setGpsLng] = useState(tour?.gps.lng.toString() || '')
  const [qcChecklist, setQcChecklist] = useState<QCChecklist>(tour?.qcChecklist || DEFAULT_QC)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(
    tour?.meshUrls.high || null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.glb') && !file.name.endsWith('.gltf')) {
      setError('Only .glb and .gltf files are supported')
      return
    }
    setError(null)
    setUploading(true)
    setUploadProgress(null)
    try {
      const result = await uploadMesh(file, (p) => setUploadProgress(p))
      setUploadedUrl(result.url)
      setSuccess(`Uploaded ${file.name} (${(result.size / (1024 * 1024)).toFixed(1)} MB)`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleSave() {
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      if (isNew) {
        await createTour({
          locationId: locationId || 'untitled',
          tourType: 'triangle_mesh',
          meshUrls: {
            preview: uploadedUrl || '',
            medium: uploadedUrl || '',
            high: uploadedUrl || '',
          },
          triangleCount: 0,
          fileSize: 0,
          bounds: { min: [0, 0, 0], max: [1, 1, 1] },
          spawnPoint: { position: [0, 1.6, 0], rotation: [0, 0, 0] },
          viewpoints: [],
          floorPlan: null,
          qcChecklist,
          gps: {
            lat: parseFloat(gpsLat) || 0,
            lng: parseFloat(gpsLng) || 0,
          },
          status: 'draft',
        })
        setSuccess('Tour created')
      } else {
        await updateTour(tour.id, {
          locationId,
          gps: {
            lat: parseFloat(gpsLat) || 0,
            lng: parseFloat(gpsLng) || 0,
          },
          meshUrls: uploadedUrl
            ? { preview: uploadedUrl, medium: uploadedUrl, high: uploadedUrl }
            : tour.meshUrls,
        })
        await updateQCChecklist(tour.id, qcChecklist)
        setSuccess('Tour updated')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!tour) return
    setError(null)
    setSuccess(null)
    setPublishing(true)
    try {
      const result = await publishTour(tour.id)
      if (result.success) {
        setSuccess('Tour published!')
      } else {
        setError(result.error || 'Publish failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  const qcComplete = Object.values(qcChecklist).every(Boolean)

  return (
    <div className="space-y-6">
      {/* Back / title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-sm"
        >
          &larr; Back
        </button>
        <h3 className="text-base font-bold text-white">
          {isNew ? 'New Tour' : `Edit Tour`}
        </h3>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-xs text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 text-xs text-green-300">
          {success}
        </div>
      )}

      {/* Basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Location ID</label>
          <input
            type="text"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder="e.g. bangkok-studio-a"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">GPS Latitude</label>
          <input
            type="text"
            value={gpsLat}
            onChange={(e) => setGpsLat(e.target.value)}
            placeholder="13.7563"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">GPS Longitude</label>
          <input
            type="text"
            value={gpsLng}
            onChange={(e) => setGpsLng(e.target.value)}
            placeholder="100.5018"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Scene upload */}
      <div>
        <label className="block text-xs text-gray-400 mb-2">Scene File (.glb)</label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-indigo-500 bg-indigo-950/30'
              : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={handleFileInput}
            className="hidden"
          />
          {uploading ? (
            <div>
              <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${uploadProgress?.percent || 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                Uploading... {uploadProgress?.percent || 0}%
              </p>
            </div>
          ) : uploadedUrl ? (
            <div>
              <p className="text-xs text-green-400">Scene uploaded</p>
              <p className="text-[10px] text-gray-500 mt-1 truncate">
                {uploadedUrl.length > 60 ? '...' + uploadedUrl.slice(-57) : uploadedUrl}
              </p>
              <p className="text-[10px] text-gray-500 mt-1">
                Drop a new file to replace
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-400">
                Drop a .glb file here or click to browse
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supports Draco compressed GLB files
              </p>
            </div>
          )}
        </div>
      </div>

      {/* QC Checklist */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-400">QC Checklist</label>
          <span className={`text-xs font-medium ${qcComplete ? 'text-green-400' : 'text-gray-500'}`}>
            {Object.values(qcChecklist).filter(Boolean).length}/{Object.keys(qcChecklist).length}
          </span>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 space-y-2">
          {(Object.keys(QC_LABELS) as (keyof QCChecklist)[]).map((key) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={qcChecklist[key]}
                onChange={(e) =>
                  setQcChecklist((prev) => ({ ...prev, [key]: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
              />
              <span className="text-xs text-gray-300">{QC_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          {saving ? 'Saving...' : isNew ? 'Create Tour' : 'Save Changes'}
        </button>

        {!isNew && (
          <button
            onClick={handlePublish}
            disabled={publishing || !qcComplete}
            title={!qcComplete ? 'Complete all QC checks before publishing' : 'Publish tour'}
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium text-sm"
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        )}

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
