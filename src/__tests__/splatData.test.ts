import { describe, it, expect, vi } from 'vitest'
import type { ParsedSplatData } from '../formats/parseSplat'

// Mock three/webgpu to avoid loading the full Three.js WebGPU bundle in tests.
// SplatData only uses DataTexture, RGBAFormat, FloatType, and NearestFilter.
vi.mock('three/webgpu', () => {
  class MockDataTexture {
    image: { data: Float32Array; width: number; height: number }
    needsUpdate = false
    minFilter = 0
    magFilter = 0
    generateMipmaps = false
    _disposed = false

    constructor(data: Float32Array, width: number, height: number, _format: number, _type: number) {
      this.image = { data, width, height }
    }

    dispose() {
      this._disposed = true
    }
  }

  return {
    DataTexture: MockDataTexture,
    RGBAFormat: 1023,
    FloatType: 1015,
    NearestFilter: 1003,
  }
})

// Import SplatData after mock is registered
const { SplatData } = await import('../SplatData')

function makeParsedData(overrides: Partial<ParsedSplatData> = {}): ParsedSplatData {
  const count = overrides.count ?? 1
  return {
    count,
    positions: overrides.positions ?? new Float32Array(count * 3),
    scales: overrides.scales ?? new Float32Array(count * 3),
    rotations: overrides.rotations ?? new Float32Array(count * 4),
    colors: overrides.colors ?? new Float32Array(count * 3),
    opacities: overrides.opacities ?? new Float32Array(count),
    sh1: overrides.sh1 ?? null,
  }
}

describe('SplatData', () => {
  it('packs position data into positionTex correctly', () => {
    const parsed = makeParsedData({
      count: 1,
      positions: new Float32Array([1.0, 2.0, 3.0]),
    })

    const data = new SplatData(parsed)
    const texData = data.positionTex.image.data

    // positionTex: (pos.x, pos.y, pos.z, 0)
    expect(texData[0]).toBeCloseTo(1.0)
    expect(texData[1]).toBeCloseTo(2.0)
    expect(texData[2]).toBeCloseTo(3.0)
    expect(texData[3]).toBeCloseTo(0) // alpha channel = 0
  })

  it('packs color and opacity into colorTex correctly', () => {
    const parsed = makeParsedData({
      count: 1,
      colors: new Float32Array([0.5, 0.7, 0.9]),
      opacities: new Float32Array([0.8]),
    })

    const data = new SplatData(parsed)
    const texData = data.colorTex.image.data

    // colorTex: (r, g, b, opacity)
    expect(texData[0]).toBeCloseTo(0.5)
    expect(texData[1]).toBeCloseTo(0.7)
    expect(texData[2]).toBeCloseTo(0.9)
    expect(texData[3]).toBeCloseTo(0.8)
  })

  it('computes correct texture dimensions for various splat counts', () => {
    const cases: Array<{ count: number; expectedWidth: number; expectedHeight: number }> = [
      { count: 1, expectedWidth: 1, expectedHeight: 1 },
      { count: 4, expectedWidth: 2, expectedHeight: 2 },
      { count: 100, expectedWidth: 10, expectedHeight: 10 },
      { count: 1000, expectedWidth: 32, expectedHeight: 32 },
    ]

    for (const { count, expectedWidth, expectedHeight } of cases) {
      const parsed = makeParsedData({ count })
      const data = new SplatData(parsed)

      // width = ceil(sqrt(count)), height = ceil(count / width)
      const w = Math.ceil(Math.sqrt(count))
      const h = Math.ceil(count / w)
      expect(data.width).toBe(w)
      expect(data.height).toBe(h)
      expect(data.width).toBe(expectedWidth)
      expect(data.height).toBe(expectedHeight)
    }
  })

  it('handles large splat counts (1M)', () => {
    const count = 1_000_000
    const parsed = makeParsedData({ count })
    const data = new SplatData(parsed)

    expect(data.width).toBe(1000) // ceil(sqrt(1M)) = 1000
    expect(data.height).toBe(1000) // ceil(1M/1000) = 1000
    expect(data.count).toBe(count)
  })

  it('packs SH1 data into three separate textures', () => {
    const sh1 = new Float32Array([
      // [r0, r1, r2, g0, g1, g2, b0, b1, b2]
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    ])

    const parsed = makeParsedData({ count: 1, sh1 })
    const data = new SplatData(parsed)

    expect(data.hasSH1).toBe(true)
    expect(data.sh1RTex).not.toBeNull()
    expect(data.sh1GTex).not.toBeNull()
    expect(data.sh1BTex).not.toBeNull()

    // Red channel: (r0, r1, r2, 0)
    const rData = data.sh1RTex!.image.data
    expect(rData[0]).toBeCloseTo(0.1)
    expect(rData[1]).toBeCloseTo(0.2)
    expect(rData[2]).toBeCloseTo(0.3)
    expect(rData[3]).toBeCloseTo(0) // padding

    // Green channel: (g0, g1, g2, 0)
    const gData = data.sh1GTex!.image.data
    expect(gData[0]).toBeCloseTo(0.4)
    expect(gData[1]).toBeCloseTo(0.5)
    expect(gData[2]).toBeCloseTo(0.6)

    // Blue channel: (b0, b1, b2, 0)
    const bData = data.sh1BTex!.image.data
    expect(bData[0]).toBeCloseTo(0.7)
    expect(bData[1]).toBeCloseTo(0.8)
    expect(bData[2]).toBeCloseTo(0.9)
  })

  it('has null SH1 textures when sh1 is null', () => {
    const parsed = makeParsedData({ count: 1, sh1: null })
    const data = new SplatData(parsed)

    expect(data.hasSH1).toBe(false)
    expect(data.sh1RTex).toBeNull()
    expect(data.sh1GTex).toBeNull()
    expect(data.sh1BTex).toBeNull()
  })

  it('disposes all textures', () => {
    const sh1 = new Float32Array(9)
    const parsed = makeParsedData({ count: 1, sh1 })
    const data = new SplatData(parsed)

    data.dispose()

    // Our mock sets _disposed = true
    expect((data.positionTex as any)._disposed).toBe(true)
    expect((data.scaleTex as any)._disposed).toBe(true)
    expect((data.rotationTex as any)._disposed).toBe(true)
    expect((data.colorTex as any)._disposed).toBe(true)
    expect((data.sh1RTex as any)._disposed).toBe(true)
    expect((data.sh1GTex as any)._disposed).toBe(true)
    expect((data.sh1BTex as any)._disposed).toBe(true)
  })

  it('packs scale data into scaleTex correctly', () => {
    const parsed = makeParsedData({
      count: 1,
      scales: new Float32Array([0.1, 0.2, 0.3]),
    })

    const data = new SplatData(parsed)
    const texData = data.scaleTex.image.data

    expect(texData[0]).toBeCloseTo(0.1)
    expect(texData[1]).toBeCloseTo(0.2)
    expect(texData[2]).toBeCloseTo(0.3)
    expect(texData[3]).toBeCloseTo(0) // padding
  })

  it('packs rotation data into rotationTex correctly', () => {
    const parsed = makeParsedData({
      count: 1,
      rotations: new Float32Array([1.0, 0.0, 0.0, 0.0]), // identity (w,x,y,z)
    })

    const data = new SplatData(parsed)
    const texData = data.rotationTex.image.data

    expect(texData[0]).toBeCloseTo(1.0)
    expect(texData[1]).toBeCloseTo(0.0)
    expect(texData[2]).toBeCloseTo(0.0)
    expect(texData[3]).toBeCloseTo(0.0)
  })

  it('pads texture data for non-square counts', () => {
    // 3 splats → width=2, height=2 → 4 texels
    const parsed = makeParsedData({
      count: 3,
      positions: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    })

    const data = new SplatData(parsed)

    expect(data.width).toBe(2)
    expect(data.height).toBe(2)

    // positionTex should have 4 texels (4 × 4 = 16 floats)
    expect(data.positionTex.image.data.length).toBe(16)

    // First 3 splats should have real data, 4th should be zeros (padding)
    const texData = data.positionTex.image.data
    expect(texData[0]).toBeCloseTo(1.0) // splat 0 x
    expect(texData[4]).toBeCloseTo(4.0) // splat 1 x
    expect(texData[8]).toBeCloseTo(7.0) // splat 2 x
    expect(texData[12]).toBeCloseTo(0)  // padding
    expect(texData[13]).toBeCloseTo(0)  // padding
  })
})
