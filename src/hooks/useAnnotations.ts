import { create } from 'zustand'
import type { Annotation, AnnotationType } from '@/types/annotation'

interface AnnotationState {
  annotations: Annotation[]
  selectedId: string | null

  addAnnotation: (annotation: Annotation) => void
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void
  removeAnnotation: (id: string) => void
  clearAnnotations: () => void
  setSelectedId: (id: string | null) => void
  getByType: (type: AnnotationType) => Annotation[]
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  selectedId: null,

  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),

  updateAnnotation: (id, updates) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a,
      ),
    })),

  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  clearAnnotations: () => set({ annotations: [], selectedId: null }),

  setSelectedId: (id) => set({ selectedId: id }),

  getByType: (type) => get().annotations.filter((a) => a.type === type),
}))
