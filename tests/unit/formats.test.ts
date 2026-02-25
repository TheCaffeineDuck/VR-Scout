import { describe, it, expect } from 'vitest'
import { getFileExtension, isSupportedFormat, validateSceneUrl } from '@/lib/formats'

describe('formats', () => {
  describe('getFileExtension', () => {
    it('extracts .glb extension', () => {
      expect(getFileExtension('/scenes/room.glb')).toBe('.glb')
    })

    it('extracts .gltf extension', () => {
      expect(getFileExtension('https://example.com/model.gltf')).toBe('.gltf')
    })

    it('handles uppercase extensions', () => {
      expect(getFileExtension('/scenes/Room.GLB')).toBe('.glb')
    })

    it('returns empty string for no extension', () => {
      expect(getFileExtension('/scenes/room')).toBe('')
    })

    it('handles query parameters', () => {
      expect(getFileExtension('/scenes/room.glb?v=2')).toBe('.glb')
    })
  })

  describe('isSupportedFormat', () => {
    it('accepts .glb files', () => {
      expect(isSupportedFormat('/scenes/room.glb')).toBe(true)
    })

    it('accepts .gltf files', () => {
      expect(isSupportedFormat('/model.gltf')).toBe(true)
    })

    it('rejects .obj files', () => {
      expect(isSupportedFormat('/model.obj')).toBe(false)
    })

    it('rejects .fbx files', () => {
      expect(isSupportedFormat('/model.fbx')).toBe(false)
    })

    it('rejects files without extension', () => {
      expect(isSupportedFormat('/model')).toBe(false)
    })
  })

  describe('validateSceneUrl', () => {
    it('validates a correct .glb URL', () => {
      const result = validateSceneUrl('/scenes/room.glb')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects empty URL', () => {
      const result = validateSceneUrl('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('URL is empty')
    })

    it('rejects unsupported format with helpful message', () => {
      const result = validateSceneUrl('/model.obj')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('.obj')
      expect(result.error).toContain('.glb')
    })
  })
})
