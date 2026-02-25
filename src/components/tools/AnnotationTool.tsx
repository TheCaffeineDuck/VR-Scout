import { useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useToolStore } from '@/stores/tool-store'
import { useViewerStore } from '@/stores/viewer-store'
import { useAnnotationStore } from '@/hooks/useAnnotations'
import { AnnotationMarker } from './AnnotationMarker'
import { raycastNearest } from '@/lib/raycaster'
import type { AnnotationType, Annotation } from '@/types/annotation'
import { ANNOTATION_TYPES } from '@/types/annotation'

/**
 * Renders all annotation markers and handles placement when annotate tool is active.
 */
export function AnnotationTool() {
  const activeTool = useToolStore((s) => s.activeTool)
  const sceneGroup = useViewerStore((s) => s.sceneGroup)
  const annotations = useAnnotationStore((s) => s.annotations)
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation)
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  // Pending placement state: click sets the point, then a form appears
  const [pendingPoint, setPendingPoint] = useState<{
    position: [number, number, number]
    normal: [number, number, number]
  } | null>(null)

  // Cursor when annotate tool active
  useEffect(() => {
    if (activeTool !== 'annotate') {
      setPendingPoint(null)
      return
    }
    gl.domElement.style.cursor = 'crosshair'
    return () => { gl.domElement.style.cursor = '' }
  }, [activeTool, gl])

  // Click handler for placing annotations
  useEffect(() => {
    if (activeTool !== 'annotate') return

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || !sceneGroup) return

      const rect = gl.domElement.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
      const hit = raycastNearest(raycaster, sceneGroup)
      if (!hit) return

      const position = hit.point.toArray() as [number, number, number]
      const normal = hit.face
        ? hit.face.normal.toArray() as [number, number, number]
        : [0, 1, 0] as [number, number, number]

      setPendingPoint({ position, normal })
    }

    gl.domElement.addEventListener('click', onClick)
    return () => gl.domElement.removeEventListener('click', onClick)
  }, [activeTool, sceneGroup, camera, gl, raycaster])

  const handleCreate = (type: AnnotationType, title: string, description: string, visibility: 'private' | 'team' | 'public') => {
    if (!pendingPoint) return

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      locationId: '',
      virtualTourId: '',
      sessionId: null,
      position: pendingPoint.position,
      normal: pendingPoint.normal,
      type,
      title: { en: title, th: '' },
      description: { en: description, th: '' },
      visibility,
      createdBy: 'local',
      createdAt: new Date(),
    }

    addAnnotation(annotation)
    setPendingPoint(null)
  }

  return (
    <group>
      {/* Render all annotations — always visible */}
      {annotations.map((a) => (
        <AnnotationMarker key={a.id} annotation={a} />
      ))}

      {/* Pending placement form as HTML overlay */}
      {pendingPoint && activeTool === 'annotate' && (
        <AnnotationForm
          onConfirm={handleCreate}
          onCancel={() => setPendingPoint(null)}
        />
      )}
    </group>
  )
}

/**
 * HTML form overlay for configuring a new annotation.
 * Rendered outside the Canvas in a portal.
 */
function AnnotationForm({
  onConfirm,
  onCancel,
}: {
  onConfirm: (type: AnnotationType, title: string, description: string, visibility: 'private' | 'team' | 'public') => void
  onCancel: () => void
}) {
  const [type, setType] = useState<AnnotationType>('custom')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'team' | 'public'>('team')

  return (
    <AnnotationFormPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
        <div className="bg-gray-900 text-white rounded-xl shadow-2xl p-5 w-80 max-h-[90vh] overflow-y-auto">
          <h3 className="text-sm font-semibold mb-3">New Annotation</h3>

          {/* Type selector */}
          <div className="mb-3">
            <label className="text-[11px] text-gray-400 block mb-1">Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(ANNOTATION_TYPES) as AnnotationType[]).map((t) => {
                const cfg = ANNOTATION_TYPES[t]
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`text-center py-1.5 rounded text-xs transition-colors ${
                      type === t
                        ? 'ring-2 ring-white bg-gray-700'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    title={cfg.label}
                  >
                    <div className="text-base">{cfg.icon}</div>
                    <div className="text-[9px] text-gray-400 mt-0.5 truncate">{cfg.type}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div className="mb-2">
            <label className="text-[11px] text-gray-400 block mb-0.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ANNOTATION_TYPES[type].label}
              className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Description */}
          <div className="mb-2">
            <label className="text-[11px] text-gray-400 block mb-0.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
              className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Visibility */}
          <div className="mb-3">
            <label className="text-[11px] text-gray-400 block mb-1">Visibility</label>
            <div className="flex gap-1.5">
              {(['private', 'team', 'public'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`flex-1 text-xs py-1 rounded capitalize transition-colors ${
                    visibility === v
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 text-xs py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(type, title || ANNOTATION_TYPES[type].label, description, visibility)}
              className="flex-1 text-xs py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
            >
              Place
            </button>
          </div>
        </div>
      </div>
    </AnnotationFormPortal>
  )
}

/**
 * Portal to render annotation form outside the R3F Canvas into the document body.
 */
function AnnotationFormPortal({ children }: { children: React.ReactNode }) {
  const [container] = useState(() => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return el
  })

  useEffect(() => {
    return () => {
      document.body.removeChild(container)
    }
  }, [container])

  return ReactDOM.createPortal(children, container)
}

import ReactDOM from 'react-dom'
