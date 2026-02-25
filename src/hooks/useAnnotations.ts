import { create } from 'zustand'
import type { Annotation, AnnotationType } from '@/types/annotation'
import {
  createAnnotation as dbCreate,
  updateAnnotation as dbUpdate,
  deleteAnnotation as dbDelete,
  onAnnotationsChange,
} from '@/lib/firestore/annotations'

interface AnnotationState {
  annotations: Annotation[]
  selectedId: string | null
  tourId: string | null
  _unsubscribe: (() => void) | null

  addAnnotation: (annotation: Annotation) => void
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void
  removeAnnotation: (id: string) => void
  clearAnnotations: () => void
  setSelectedId: (id: string | null) => void
  getByType: (type: AnnotationType) => Annotation[]

  /** Persist a new annotation to Firestore/local and add to store */
  persistAnnotation: (
    ann: Omit<Annotation, 'id' | 'createdAt'>
  ) => Promise<Annotation>
  /** Load annotations for a tour and subscribe to real-time updates */
  loadForTour: (virtualTourId: string) => void
  /** Unsubscribe from real-time updates */
  unsubscribe: () => void
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  selectedId: null,
  tourId: null,
  _unsubscribe: null,

  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),

  updateAnnotation: (id, updates) => {
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    }))
    // Persist update in background
    dbUpdate(id, updates).catch((err) =>
      console.warn('[Annotations] Failed to persist update:', err)
    )
  },

  removeAnnotation: (id) => {
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
    // Persist deletion in background
    dbDelete(id).catch((err) =>
      console.warn('[Annotations] Failed to persist deletion:', err)
    )
  },

  clearAnnotations: () => set({ annotations: [], selectedId: null }),

  setSelectedId: (id) => set({ selectedId: id }),

  getByType: (type) => get().annotations.filter((a) => a.type === type),

  persistAnnotation: async (ann) => {
    const saved = await dbCreate(ann)
    set((s) => ({ annotations: [...s.annotations, saved] }))
    return saved
  },

  loadForTour: (virtualTourId) => {
    // Unsubscribe from previous tour
    const prev = get()._unsubscribe
    if (prev) prev()

    set({ tourId: virtualTourId, annotations: [], selectedId: null })

    const unsub = onAnnotationsChange(virtualTourId, (annotations) => {
      set({ annotations })
    })
    set({ _unsubscribe: unsub })
  },

  unsubscribe: () => {
    const unsub = get()._unsubscribe
    if (unsub) {
      unsub()
      set({ _unsubscribe: null })
    }
  },
}))
