import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/hooks/useAuthContext'
import {
  createTour,
  getTour,
  updateTour,
  deleteTour,
  updateQCChecklist,
  publishTour,
} from '@/lib/firestore/tours'
import { uploadMesh, uploadScreenshot, type UploadProgress } from '@/lib/r2-upload'
import type { VirtualTour, QCChecklist, FloorPlan } from '@/types/scene'

// ---- Types ----

interface UploadTierState {
  status: 'idle' | 'uploading' | 'complete' | 'error'
  progress: number
  url: string
  size: number
  error: string
}

const defaultUploadState = (): UploadTierState => ({
  status: 'idle', progress: 0, url: '', size: 0, error: '',
})

const defaultQC = (): QCChecklist => ({
  noArtifacts: false,
  fullCoverage: false,
  accurateLighting: false,
  calibratedScale: false,
  fileSizeOk: false,
  lodGenerated: false,
  viewpointsMarked: false,
  annotationsAdded: false,
})

const QC_ITEMS: { key: keyof QCChecklist; label: string; required: boolean }[] = [
  { key: 'noArtifacts', label: 'No floating artifacts', required: true },
  { key: 'fullCoverage', label: 'Full spatial coverage (no black holes)', required: true },
  { key: 'accurateLighting', label: 'Accurate lighting / natural colors', required: true },
  { key: 'calibratedScale', label: 'Calibrated scale (measurements match real-world)', required: true },
  { key: 'fileSizeOk', label: 'File size within targets', required: true },
  { key: 'lodGenerated', label: 'LOD versions generated (preview, medium, high)', required: true },
  { key: 'viewpointsMarked', label: 'Key viewpoints marked', required: false },
  { key: 'annotationsAdded', label: 'Production annotations added', required: false },
]

// ---- Component ----

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new' || !id
  const navigate = useNavigate()
  const { user } = useAuthContext()

  // Form state
  const [locationId, setLocationId] = useState('')
  const [propertyName, setPropertyName] = useState('')
  const [propertyNameTh, setPropertyNameTh] = useState('')
  const [lat, setLat] = useState(0)
  const [lng, setLng] = useState(0)
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft')
  const [qcChecklist, setQcChecklist] = useState<QCChecklist>(defaultQC())
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null)
  const [northOffset, setNorthOffset] = useState(0)
  const [splatCount, setSplatCount] = useState(0)
  const [fileSize, setFileSize] = useState(0)

  // Upload state per tier
  const [uploads, setUploads] = useState({
    preview: defaultUploadState(),
    medium: defaultUploadState(),
    high: defaultUploadState(),
  })
  const [floorPlanUpload, setFloorPlanUpload] = useState(defaultUploadState())

  // Page state
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [tourId, setTourId] = useState<string | null>(isNew ? null : id!)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false)

  // Load existing tour
  useEffect(() => {
    if (isNew || !id) return
    let cancelled = false
    getTour(id).then((tour) => {
      if (cancelled) return
      if (!tour) {
        setError('Tour not found')
        setLoading(false)
        return
      }
      setLocationId(tour.locationId)
      setPropertyName(tour.locationId) // Use locationId as name fallback
      setLat(tour.gps?.lat || 0)
      setLng(tour.gps?.lng || 0)
      setStatus(tour.status)
      setQcChecklist(tour.qcChecklist || defaultQC())
      setFloorPlan(tour.floorPlan)
      setNorthOffset(tour.floorPlan?.northOffset || 0)
      setSplatCount(tour.splatCount || 0)
      setFileSize(tour.fileSize || 0)

      // Populate upload states from existing URLs
      const splatUrls = tour.splatUrls || { preview: '', medium: '', high: '' }
      setUploads({
        preview: splatUrls.preview
          ? { status: 'complete', progress: 100, url: splatUrls.preview, size: 0, error: '' }
          : defaultUploadState(),
        medium: splatUrls.medium
          ? { status: 'complete', progress: 100, url: splatUrls.medium, size: 0, error: '' }
          : defaultUploadState(),
        high: splatUrls.high
          ? { status: 'complete', progress: 100, url: splatUrls.high, size: 0, error: '' }
          : defaultUploadState(),
      })

      if (tour.floorPlan?.imageUrl) {
        setFloorPlanUpload({
          status: 'complete', progress: 100, url: tour.floorPlan.imageUrl, size: 0, error: '',
        })
      }

      setLoading(false)
    }).catch((err) => {
      if (!cancelled) {
        setError(String(err))
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [id, isNew])

  // Validation
  const locationIdValid = /^[a-z0-9_]+$/.test(locationId) && locationId.length > 0
  const latValid = lat >= -90 && lat <= 90
  const lngValid = lng >= -180 && lng <= 180

  const requiredQCPassed = QC_ITEMS.filter((i) => i.required).every((i) => qcChecklist[i.key])
  const hasPreview = uploads.preview.status === 'complete'
  const hasHigh = uploads.high.status === 'complete'
  const canPublish = requiredQCPassed && hasPreview && hasHigh

  // Clear success message after 3s
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  // ---- Handlers ----

  const handleSave = useCallback(async () => {
    if (!locationIdValid) {
      setError('Location ID must be lowercase alphanumeric + underscores')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const splatUrls = {
        preview: uploads.preview.url || '',
        medium: uploads.medium.url || '',
        high: uploads.high.url || '',
      }

      const floorPlanData: FloorPlan | null = floorPlanUpload.url
        ? {
            imageUrl: floorPlanUpload.url,
            northOffset,
            bounds: { min: [0, 0], max: [1, 1] },
          }
        : null

      if (isNew || !tourId) {
        const tour = await createTour({
          locationId,
          tourType: 'gaussian_splat',
          splatUrls,
          splatCount,
          fileSize,
          bounds: { min: [0, 0, 0], max: [1, 1, 1] },
          spawnPoint: { position: [0, 1.6, 0], rotation: [0, 0, 0] },
          viewpoints: [],
          floorPlan: floorPlanData,
          qcChecklist,
          gps: { lat, lng },
          status: 'draft',
        })
        setTourId(tour.id)
        setSuccessMsg('Property created')
        navigate(`/admin/properties/${tour.id}`, { replace: true })
      } else {
        await updateTour(tourId, {
          locationId,
          splatUrls,
          splatCount,
          fileSize,
          floorPlan: floorPlanData,
          gps: { lat, lng },
          status,
        })
        setSuccessMsg('Property saved')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }, [
    locationId, locationIdValid, propertyName, lat, lng, status, uploads,
    floorPlanUpload, northOffset, qcChecklist, tourId, isNew, navigate,
    splatCount, fileSize,
  ])

  const handleFileUpload = useCallback(async (
    file: File,
    tier: 'preview' | 'medium' | 'high'
  ) => {
    if (!file.name.endsWith('.spz') && !file.name.endsWith('.ply') && !file.name.endsWith('.splat')) {
      setError('Only .spz, .ply, and .splat files are accepted')
      return
    }

    setUploads((prev) => ({
      ...prev,
      [tier]: { status: 'uploading', progress: 0, url: '', size: 0, error: '' },
    }))

    try {
      const result = await uploadMesh(file, (progress: UploadProgress) => {
        setUploads((prev) => ({
          ...prev,
          [tier]: { ...prev[tier], progress: progress.percent },
        }))
      })

      setUploads((prev) => ({
        ...prev,
        [tier]: { status: 'complete', progress: 100, url: result.url, size: result.size, error: '' },
      }))

      // Auto-update tour document if we have an ID
      if (tourId) {
        await updateTour(tourId, {
          splatUrls: {
            ...{
              preview: uploads.preview.url,
              medium: uploads.medium.url,
              high: uploads.high.url,
            },
            [tier]: result.url,
          },
        })
      }
    } catch (err) {
      setUploads((prev) => ({
        ...prev,
        [tier]: { ...prev[tier], status: 'error', error: String(err) },
      }))
    }
  }, [tourId, uploads])

  const handleFloorPlanUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are accepted for floor plans')
      return
    }

    setFloorPlanUpload({ status: 'uploading', progress: 0, url: '', size: 0, error: '' })

    try {
      // Use screenshot upload which handles images
      const dataUrl = await fileToDataUrl(file)
      const result = await uploadScreenshot(
        dataUrl,
        `floorplan_${locationId || 'new'}.${file.name.split('.').pop()}`,
        (progress: UploadProgress) => {
          setFloorPlanUpload((prev) => ({ ...prev, progress: progress.percent }))
        }
      )
      setFloorPlanUpload({
        status: 'complete', progress: 100, url: result.url, size: result.size, error: '',
      })
    } catch (err) {
      setFloorPlanUpload((prev) => ({
        ...prev, status: 'error', error: String(err),
      }))
    }
  }, [locationId])

  const handleQCToggle = useCallback(async (key: keyof QCChecklist) => {
    const next = { ...qcChecklist, [key]: !qcChecklist[key] }
    setQcChecklist(next)
    if (tourId) {
      await updateQCChecklist(tourId, { [key]: next[key] }).catch(() => {})
    }
  }, [qcChecklist, tourId])

  const handlePublish = useCallback(async () => {
    if (!tourId) return
    setShowPublishConfirm(false)
    try {
      const result = await publishTour(tourId)
      if (result.success) {
        setStatus('published')
        setSuccessMsg('Property published')
      } else {
        setError(result.error || 'Publish failed')
      }
    } catch (err) {
      setError(String(err))
    }
  }, [tourId])

  const handleUnpublish = useCallback(async () => {
    if (!tourId) return
    setShowUnpublishConfirm(false)
    try {
      await updateTour(tourId, { status: 'draft' })
      setStatus('draft')
      setSuccessMsg('Property unpublished')
    } catch (err) {
      setError(String(err))
    }
  }, [tourId])

  const handleDelete = useCallback(async () => {
    if (!tourId) return
    setShowDeleteConfirm(false)
    try {
      await deleteTour(tourId)
      navigate('/admin/properties', { replace: true })
    } catch (err) {
      setError(String(err))
    }
  }, [tourId, navigate])

  // ---- Render ----

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading property...</p>
  }

  return (
    <div className="max-w-3xl">
      {/* Header + Quick Actions */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/admin/properties')}
            className="text-gray-500 hover:text-gray-300 text-xs mb-1 inline-block"
          >
            &larr; Back to Properties
          </button>
          <h1 className="text-xl font-bold">
            {isNew ? 'New Property' : `Edit: ${locationId}`}
          </h1>
        </div>
        {!isNew && tourId && (
          <div className="flex gap-2">
            <button
              onClick={() => window.open(`/scout/${locationId}`, '_blank')}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              Preview in Viewer
            </button>
            {status === 'draft' && (
              <button
                onClick={() => canPublish ? setShowPublishConfirm(true) : undefined}
                disabled={!canPublish}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  canPublish
                    ? 'bg-green-700 hover:bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
                title={!canPublish ? 'Complete required QC items and upload preview + high LOD' : ''}
              >
                Publish
              </button>
            )}
            {status === 'published' && (
              <button
                onClick={() => setShowUnpublishConfirm(true)}
                className="px-3 py-1.5 text-xs bg-yellow-800 hover:bg-yellow-700 rounded transition-colors"
              >
                Unpublish
              </button>
            )}
            {status === 'draft' && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 rounded transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-300">&times;</button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-800 rounded text-sm text-green-300">
          {successMsg}
        </div>
      )}

      {/* Section A: Metadata */}
      <Section title="Metadata">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Location ID" required>
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              readOnly={!isNew && !!tourId}
              placeholder="sunset_studio_bkk"
              className={`w-full bg-gray-800 border rounded px-3 py-1.5 text-sm ${
                !isNew && tourId ? 'border-gray-700 text-gray-500' : 'border-gray-700 text-gray-200'
              } focus:outline-none focus:border-blue-500`}
            />
            {locationId && !locationIdValid && (
              <p className="text-red-400 text-xs mt-1">Lowercase alphanumeric + underscores only</p>
            )}
          </Field>
          <Field label="Property Name (EN)">
            <input
              type="text"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              placeholder="Sunset Studio Bangkok"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </Field>
          <Field label="Property Name (TH)">
            <input
              type="text"
              value={propertyNameTh}
              onChange={(e) => setPropertyNameTh(e.target.value)}
              placeholder="(optional)"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Latitude">
              <input
                type="number"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
                min={-90} max={90} step={0.000001}
                className={`w-full bg-gray-800 border rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 ${
                  !latValid ? 'border-red-500' : 'border-gray-700'
                }`}
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                value={lng}
                onChange={(e) => setLng(Number(e.target.value))}
                min={-180} max={180} step={0.000001}
                className={`w-full bg-gray-800 border rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 ${
                  !lngValid ? 'border-red-500' : 'border-gray-700'
                }`}
              />
            </Field>
          </div>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              disabled={status !== 'draft' && !canPublish}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 disabled:text-gray-600"
              title={!canPublish && status === 'draft' ? 'Complete QC and upload files to publish' : ''}
            >
              <option value="draft">Draft</option>
              <option value="published" disabled={!canPublish}>
                Published{!canPublish ? ' (QC incomplete)' : ''}
              </option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <button
            onClick={handleSave}
            disabled={saving || !locationIdValid}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : isNew ? 'Create Property' : 'Save Changes'}
          </button>
        </div>
      </Section>

      {/* Section B: Scene File Upload */}
      <Section title="Scene Files">
        <div className="space-y-4">
          <UploadZone
            tier="preview"
            label="Preview LOD (low splat count)"
            description="Required. Fast loading, thumbnails."
            state={uploads.preview}
            onUpload={(f) => handleFileUpload(f, 'preview')}
          />
          <UploadZone
            tier="medium"
            label="Medium LOD (medium splat count)"
            description="Optional. WiFi/5G browsing."
            state={uploads.medium}
            onUpload={(f) => handleFileUpload(f, 'medium')}
          />
          <UploadZone
            tier="high"
            label="High LOD (full quality)"
            description="Required for publishing. Full quality VR."
            state={uploads.high}
            onUpload={(f) => handleFileUpload(f, 'high')}
          />
        </div>
      </Section>

      {/* Section C: Spawn Point (read-only info) */}
      <Section title="Spawn Point">
        <p className="text-gray-500 text-xs">
          Default: position [0, 1.6, 0] facing forward [0, 0, 0]. Gaussian Splat scenes
          are pre-oriented by the capture pipeline.
        </p>
      </Section>

      {/* Section D: Floor Plan */}
      <Section title="Floor Plan">
        <UploadZone
          tier="floorplan"
          label="Floor plan image (PNG/JPEG)"
          description="Users will see this as a minimap overlay."
          state={floorPlanUpload}
          onUpload={handleFloorPlanUpload}
          accept="image/png,image/jpeg"
        />
        {floorPlanUpload.url && (
          <Field label="North offset (degrees)" className="mt-3">
            <input
              type="number"
              value={northOffset}
              onChange={(e) => setNorthOffset(Number(e.target.value))}
              min={0} max={360} step={1}
              className="w-32 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            />
            <p className="text-gray-600 text-xs mt-1">
              Degrees clockwise from top of image to true north
            </p>
          </Field>
        )}
        {!floorPlanUpload.url && (
          <p className="text-gray-600 text-xs mt-2">
            No floor plan uploaded. Users will not see the minimap.
          </p>
        )}
      </Section>

      {/* Section E: QC Checklist */}
      <Section title="QC Checklist">
        <div className="space-y-2">
          {QC_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-3 py-1 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={qcChecklist[item.key]}
                onChange={() => handleQCToggle(item.key)}
                className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-gray-300 group-hover:text-gray-100">
                {item.label}
              </span>
              {item.required ? (
                <span className="text-xs text-yellow-600">Required</span>
              ) : (
                <span className="text-xs text-gray-700">Recommended</span>
              )}
            </label>
          ))}
        </div>

        <div className="mt-4 p-3 rounded border text-sm">
          {canPublish ? (
            <div className="border-green-800 bg-green-900/20 text-green-400 border rounded p-3">
              Ready to publish. All required QC items passed and scene files uploaded.
            </div>
          ) : (
            <div className="border-yellow-800 bg-yellow-900/20 text-yellow-400 border rounded p-3">
              <p className="font-medium mb-1">Not ready to publish:</p>
              <ul className="text-xs space-y-0.5 list-disc pl-4">
                {!hasPreview && <li>Upload preview LOD scene file</li>}
                {!hasHigh && <li>Upload high LOD scene file</li>}
                {QC_ITEMS.filter((i) => i.required && !qcChecklist[i.key]).map((i) => (
                  <li key={i.key}>{i.label}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {/* Confirmation Dialogs */}
      {showPublishConfirm && (
        <ConfirmDialog
          title="Publish Property"
          message={`Publish "${locationId}"? It will become accessible to users.`}
          confirmLabel="Publish"
          confirmClass="bg-green-700 hover:bg-green-600"
          onConfirm={handlePublish}
          onCancel={() => setShowPublishConfirm(false)}
        />
      )}
      {showUnpublishConfirm && (
        <ConfirmDialog
          title="Unpublish Property"
          message={`Unpublish "${locationId}"? It will revert to draft status.`}
          confirmLabel="Unpublish"
          confirmClass="bg-yellow-700 hover:bg-yellow-600"
          onConfirm={handleUnpublish}
          onCancel={() => setShowUnpublishConfirm(false)}
        />
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Property"
          message={`Delete "${locationId}"? The tour document will be removed. Scene files on R2 will not be deleted.`}
          confirmLabel="Delete"
          confirmClass="bg-red-700 hover:bg-red-600"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

// ---- Sub-components ----

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 border-b border-gray-800 pb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, required, className, children }: {
  label: string; required?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function UploadZone({ tier, label, description, state, onUpload, accept }: {
  tier: string
  label: string
  description: string
  state: UploadTierState
  onUpload: (file: File) => void
  accept?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onUpload(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  return (
    <div
      className={`border rounded p-4 transition-colors ${
        dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-gray-800 bg-gray-900/50'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-300">{label}</p>
          <p className="text-xs text-gray-600">{description}</p>
        </div>
        {state.status === 'complete' && (
          <span className="text-xs text-green-400 font-medium">Uploaded</span>
        )}
      </div>

      {state.status === 'idle' && (
        <div className="mt-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
          >
            Choose file or drag & drop
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={accept || '.spz,.ply,.splat'}
            className="hidden"
            onChange={handleChange}
          />
        </div>
      )}

      {state.status === 'uploading' && (
        <div className="mt-3">
          <div className="h-2 bg-gray-800 rounded overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Uploading... {state.progress}%</p>
        </div>
      )}

      {state.status === 'complete' && (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-xs text-gray-500 truncate flex-1">
            {state.url ? truncateUrl(state.url) : 'Uploaded'}
            {state.size > 0 && ` (${formatBytes(state.size)})`}
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors shrink-0"
          >
            Replace
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={accept || '.spz,.ply,.splat'}
            className="hidden"
            onChange={handleChange}
          />
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-3">
          <p className="text-xs text-red-400">{state.error}</p>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-2 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
          >
            Try again
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={accept || '.spz,.ply,.splat'}
            className="hidden"
            onChange={handleChange}
          />
        </div>
      )}
    </div>
  )
}

function ConfirmDialog({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }: {
  title: string
  message: string
  confirmLabel: string
  confirmClass: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-sm font-bold mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs text-white rounded transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Helpers ----

function truncateUrl(url: string): string {
  if (url.length <= 60) return url
  return url.slice(0, 30) + '...' + url.slice(-25)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
