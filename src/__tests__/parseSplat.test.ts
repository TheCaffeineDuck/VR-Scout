import { describe, it, expect } from 'vitest'
import { parseSplat } from '../formats/parseSplat'

/**
 * Build a 32-byte .splat buffer for one splat.
 *
 * Layout per splat (32 bytes):
 *   0-11  : 3 × float32 — position (x, y, z)
 *  12-23  : 3 × float32 — scale (sx, sy, sz)
 *  24-27  : 4 × uint8   — color RGBA
 *  28-31  : 4 × uint8   — rotation (w, x, y, z) encoded as (float + 1) / 2 * 255
 */
function buildSplatBuffer(splats: Array<{
  pos: [number, number, number]
  scale: [number, number, number]
  color: [number, number, number, number] // RGBA 0–255
  rot: [number, number, number, number]   // quaternion (w, x, y, z) in [-1, 1]
}>): ArrayBuffer {
  const buf = new ArrayBuffer(splats.length * 32)
  const f32 = new Float32Array(buf)
  const u8 = new Uint8Array(buf)

  for (let i = 0; i < splats.length; i++) {
    const s = splats[i]
    const f32Off = i * 8
    const byteOff = i * 32

    // Position
    f32[f32Off] = s.pos[0]
    f32[f32Off + 1] = s.pos[1]
    f32[f32Off + 2] = s.pos[2]

    // Scale
    f32[f32Off + 3] = s.scale[0]
    f32[f32Off + 4] = s.scale[1]
    f32[f32Off + 5] = s.scale[2]

    // Color RGBA
    u8[byteOff + 24] = s.color[0]
    u8[byteOff + 25] = s.color[1]
    u8[byteOff + 26] = s.color[2]
    u8[byteOff + 27] = s.color[3]

    // Rotation — encode as uint8: (float + 1) / 2 * 255
    u8[byteOff + 28] = Math.round((s.rot[0] + 1) / 2 * 255)
    u8[byteOff + 29] = Math.round((s.rot[1] + 1) / 2 * 255)
    u8[byteOff + 30] = Math.round((s.rot[2] + 1) / 2 * 255)
    u8[byteOff + 31] = Math.round((s.rot[3] + 1) / 2 * 255)
  }

  return buf
}

describe('parseSplat', () => {
  it('decodes a single splat with all fields correct', () => {
    const buf = buildSplatBuffer([{
      pos: [1.0, 2.0, 3.0],
      scale: [0.1, 0.2, 0.3],
      color: [255, 128, 0, 200],
      rot: [1.0, 0.0, 0.0, 0.0], // identity quaternion (w=1)
    }])

    const result = parseSplat(buf)

    expect(result.count).toBe(1)

    // Positions
    expect(result.positions[0]).toBeCloseTo(1.0)
    expect(result.positions[1]).toBeCloseTo(2.0)
    expect(result.positions[2]).toBeCloseTo(3.0)

    // Scales
    expect(result.scales[0]).toBeCloseTo(0.1)
    expect(result.scales[1]).toBeCloseTo(0.2)
    expect(result.scales[2]).toBeCloseTo(0.3)

    // Colors (uint8 → float: 255/255=1.0, 128/255≈0.502, 0/255=0.0)
    expect(result.colors[0]).toBeCloseTo(1.0)
    expect(result.colors[1]).toBeCloseTo(128 / 255)
    expect(result.colors[2]).toBeCloseTo(0.0)

    // Opacity (200/255 ≈ 0.784)
    expect(result.opacities[0]).toBeCloseTo(200 / 255)

    // Rotation — should be a normalized quaternion
    const rw = result.rotations[0]
    const rx = result.rotations[1]
    const ry = result.rotations[2]
    const rz = result.rotations[3]
    const len = Math.sqrt(rw * rw + rx * rx + ry * ry + rz * rz)
    expect(len).toBeCloseTo(1.0)

    // The identity quaternion (1,0,0,0) encoded as uint8 and decoded should be close
    // uint8 encoding: w=(1+1)/2*255=255, x=(0+1)/2*255=127.5→128, etc.
    // decoding: w=255/255*2-1=1.0, x=128/255*2-1≈0.004 (close to 0)
    expect(rw).toBeCloseTo(1.0, 1)
    expect(Math.abs(rx)).toBeLessThan(0.02)
    expect(Math.abs(ry)).toBeLessThan(0.02)
    expect(Math.abs(rz)).toBeLessThan(0.02)

    // SH1 should be null for .splat files
    expect(result.sh1).toBeNull()
  })

  it('decodes multiple splats independently', () => {
    const buf = buildSplatBuffer([
      {
        pos: [1.0, 2.0, 3.0],
        scale: [0.1, 0.2, 0.3],
        color: [255, 0, 0, 255],
        rot: [1.0, 0.0, 0.0, 0.0],
      },
      {
        pos: [4.0, 5.0, 6.0],
        scale: [0.4, 0.5, 0.6],
        color: [0, 255, 0, 128],
        rot: [0.0, 1.0, 0.0, 0.0],
      },
    ])

    const result = parseSplat(buf)

    expect(result.count).toBe(2)

    // First splat
    expect(result.positions[0]).toBeCloseTo(1.0)
    expect(result.positions[1]).toBeCloseTo(2.0)
    expect(result.positions[2]).toBeCloseTo(3.0)
    expect(result.colors[0]).toBeCloseTo(1.0)

    // Second splat
    expect(result.positions[3]).toBeCloseTo(4.0)
    expect(result.positions[4]).toBeCloseTo(5.0)
    expect(result.positions[5]).toBeCloseTo(6.0)
    expect(result.colors[3]).toBeCloseTo(0.0)
    expect(result.colors[4]).toBeCloseTo(1.0)
    expect(result.opacities[1]).toBeCloseTo(128 / 255)
  })

  it('throws on invalid file size (not a multiple of 32)', () => {
    const buf = new ArrayBuffer(33)
    expect(() => parseSplat(buf)).toThrow('not a multiple of 32')
  })

  it('handles empty file (0 bytes)', () => {
    const buf = new ArrayBuffer(0)
    const result = parseSplat(buf)
    expect(result.count).toBe(0)
    expect(result.positions.length).toBe(0)
    expect(result.scales.length).toBe(0)
    expect(result.rotations.length).toBe(0)
    expect(result.colors.length).toBe(0)
    expect(result.opacities.length).toBe(0)
  })
})
