import { create } from 'zustand'
import type { VirtualCamera } from '@/types/camera'

const MAX_CAMERAS = 3

interface VirtualCameraState {
  cameras: VirtualCamera[]
  activeCameraId: string | null

  addCamera: (cam: VirtualCamera) => boolean
  removeCamera: (id: string) => void
  updateCamera: (id: string, updates: Partial<VirtualCamera>) => void
  setActiveCameraId: (id: string | null) => void
  setLens: (id: string, lensIndex: number) => void
  clearCameras: () => void
}

export const useVirtualCameraStore = create<VirtualCameraState>((set, get) => ({
  cameras: [],
  activeCameraId: null,

  addCamera: (cam) => {
    if (get().cameras.length >= MAX_CAMERAS) return false
    set((s) => ({ cameras: [...s.cameras, cam], activeCameraId: cam.id }))
    return true
  },

  removeCamera: (id) =>
    set((s) => ({
      cameras: s.cameras.filter((c) => c.id !== id),
      activeCameraId: s.activeCameraId === id ? null : s.activeCameraId,
    })),

  updateCamera: (id, updates) =>
    set((s) => ({
      cameras: s.cameras.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  setActiveCameraId: (id) => set({ activeCameraId: id }),

  setLens: (id, lensIndex) =>
    set((s) => ({
      cameras: s.cameras.map((c) =>
        c.id === id ? { ...c, lensIndex } : c,
      ),
    })),

  clearCameras: () => set({ cameras: [], activeCameraId: null }),
}))
