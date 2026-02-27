import { describe, it, expect, beforeEach } from 'vitest'
import { useVirtualCameraStore } from '@/hooks/useVirtualCamera'
import type { VirtualCamera } from '@/types/camera'

function makeCamera(overrides: Partial<VirtualCamera> = {}): VirtualCamera {
  return {
    id: 'cam-1',
    position: [0, 1.6, 0],
    rotation: [0, 0, 0],
    lensIndex: 2, // 35mm Standard
    placedBy: 'user-1',
    ...overrides,
  }
}

describe('virtual-camera-store', () => {
  beforeEach(() => {
    useVirtualCameraStore.setState({
      cameras: [],
      activeCameraId: null,
    })
  })

  describe('addCamera', () => {
    it('should add a camera and set it as active', () => {
      const result = useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))

      expect(result).toBe(true)
      const { cameras, activeCameraId } = useVirtualCameraStore.getState()
      expect(cameras).toHaveLength(1)
      expect(cameras[0].id).toBe('cam-1')
      expect(activeCameraId).toBe('cam-1')
    })

    it('should allow up to 3 cameras', () => {
      const { addCamera } = useVirtualCameraStore.getState()
      expect(addCamera(makeCamera({ id: 'cam-1' }))).toBe(true)
      expect(useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2' }))).toBe(true)
      expect(useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-3' }))).toBe(true)

      expect(useVirtualCameraStore.getState().cameras).toHaveLength(3)
    })

    it('should reject a 4th camera and return false', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-3' }))

      const result = useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-4' }))

      expect(result).toBe(false)
      expect(useVirtualCameraStore.getState().cameras).toHaveLength(3)
    })

    it('should set the most recently added camera as active', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2' }))

      expect(useVirtualCameraStore.getState().activeCameraId).toBe('cam-2')
    })

    it('should preserve camera position and rotation', () => {
      useVirtualCameraStore.getState().addCamera(
        makeCamera({
          id: 'cam-1',
          position: [5, 2.5, -3],
          rotation: [10, 45, 0],
        })
      )

      const cam = useVirtualCameraStore.getState().cameras[0]
      expect(cam.position).toEqual([5, 2.5, -3])
      expect(cam.rotation).toEqual([10, 45, 0])
    })
  })

  describe('removeCamera', () => {
    it('should remove a camera by id', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2' }))

      useVirtualCameraStore.getState().removeCamera('cam-1')

      const { cameras } = useVirtualCameraStore.getState()
      expect(cameras).toHaveLength(1)
      expect(cameras[0].id).toBe('cam-2')
    })

    it('should clear activeCameraId when active camera is removed', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      // cam-1 is now active
      useVirtualCameraStore.getState().removeCamera('cam-1')

      expect(useVirtualCameraStore.getState().activeCameraId).toBeNull()
    })

    it('should not affect activeCameraId when a different camera is removed', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2' }))
      // cam-2 is active
      useVirtualCameraStore.getState().removeCamera('cam-1')

      expect(useVirtualCameraStore.getState().activeCameraId).toBe('cam-2')
    })

    it('should allow adding a new camera after removing one at max capacity', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-3' }))

      useVirtualCameraStore.getState().removeCamera('cam-2')
      const result = useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-4' }))

      expect(result).toBe(true)
      expect(useVirtualCameraStore.getState().cameras).toHaveLength(3)
    })
  })

  describe('updateCamera', () => {
    it('should update camera position', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().updateCamera('cam-1', { position: [10, 5, 10] })

      expect(useVirtualCameraStore.getState().cameras[0].position).toEqual([10, 5, 10])
    })

    it('should update camera rotation', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().updateCamera('cam-1', { rotation: [0, 90, 0] })

      expect(useVirtualCameraStore.getState().cameras[0].rotation).toEqual([0, 90, 0])
    })

    it('should not affect other cameras', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1', lensIndex: 0 }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2', lensIndex: 1 }))

      useVirtualCameraStore.getState().updateCamera('cam-1', { lensIndex: 5 })

      expect(useVirtualCameraStore.getState().cameras[0].lensIndex).toBe(5)
      expect(useVirtualCameraStore.getState().cameras[1].lensIndex).toBe(1) // unchanged
    })
  })

  describe('setLens', () => {
    it('should change the lens index for a camera', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1', lensIndex: 0 }))
      useVirtualCameraStore.getState().setLens('cam-1', 4) // 85mm Portrait

      expect(useVirtualCameraStore.getState().cameras[0].lensIndex).toBe(4)
    })

    it('should only affect the specified camera', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1', lensIndex: 0 }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2', lensIndex: 1 }))

      useVirtualCameraStore.getState().setLens('cam-1', 3)

      expect(useVirtualCameraStore.getState().cameras[0].lensIndex).toBe(3)
      expect(useVirtualCameraStore.getState().cameras[1].lensIndex).toBe(1)
    })

    it('should allow setting any valid lens index (0-5)', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))

      for (let i = 0; i <= 5; i++) {
        useVirtualCameraStore.getState().setLens('cam-1', i)
        expect(useVirtualCameraStore.getState().cameras[0].lensIndex).toBe(i)
      }
    })
  })

  describe('setActiveCameraId', () => {
    it('should set the active camera', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2' }))

      useVirtualCameraStore.getState().setActiveCameraId('cam-1')
      expect(useVirtualCameraStore.getState().activeCameraId).toBe('cam-1')
    })

    it('should set to null for deselection', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().setActiveCameraId(null)

      expect(useVirtualCameraStore.getState().activeCameraId).toBeNull()
    })
  })

  describe('clearCameras', () => {
    it('should remove all cameras and reset active', () => {
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-1' }))
      useVirtualCameraStore.getState().addCamera(makeCamera({ id: 'cam-2' }))

      useVirtualCameraStore.getState().clearCameras()

      expect(useVirtualCameraStore.getState().cameras).toEqual([])
      expect(useVirtualCameraStore.getState().activeCameraId).toBeNull()
    })
  })
})
