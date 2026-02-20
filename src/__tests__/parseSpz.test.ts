import { describe, it, expect } from 'vitest'
import { parseSpz } from '../formats/parseSpz'

/**
 * Compress data with gzip using the browser-native CompressionStream.
 */
async function gzipCompress(data: Uint8Array): Promise<ArrayBuffer> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(data)
  writer.close()
  const reader = cs.readable.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result.buffer
}

/**
 * Build a raw (uncompressed) SPZ v2 binary blob for testing.
 *
 * SPZ v2 layout:
 *   Header (16 bytes): magic(4) + version(4) + numPoints(4) + shDegree(1) + fractionalBits(1) + flags(1) + reserved(1)
 *   Positions: numPoints × 9 bytes (3 × 24-bit signed fixed-point)
 *   Alphas: numPoints × 1 byte
 *   Colors: numPoints × 3 bytes
 *   Scales: numPoints × 3 bytes
 *   Rotations (v2): numPoints × 3 bytes
 */
function buildRawSpz(options: {
  numPoints: number
  shDegree?: number
  fractionalBits?: number
  positions: Array<[number, number, number]>
  opacities: number[]    // 0–1 range
  colors: Array<[number, number, number]> // 0–1 range
  scales: Array<[number, number, number]> // linear
  rotations: Array<[number, number, number, number]> // quaternion (w, x, y, z)
}): Uint8Array {
  const {
    numPoints,
    shDegree = 0,
    fractionalBits = 12,
    positions,
    opacities,
    colors,
    scales,
    rotations,
  } = options

  const rotBytesPerPoint = 3 // v2
  const shCoeffCount = shDegree >= 1 ? 9 : 0
  const totalSize = 16 + numPoints * 9 + numPoints + numPoints * 3 + numPoints * 3 + numPoints * rotBytesPerPoint + numPoints * shCoeffCount

  const raw = new Uint8Array(totalSize)
  const view = new DataView(raw.buffer)

  // Header
  raw[0] = 0x4e // 'N'
  raw[1] = 0x47 // 'G'
  raw[2] = 0x53 // 'S'
  raw[3] = 0x50 // 'P'
  view.setUint32(4, 2, true)         // version = 2
  view.setUint32(8, numPoints, true)  // numPoints
  raw[12] = shDegree
  raw[13] = fractionalBits
  raw[14] = 0 // flags
  raw[15] = 0 // reserved

  let offset = 16

  // Positions: 3 × 24-bit signed fixed-point per splat
  const fractScale = 1 << fractionalBits
  for (let i = 0; i < numPoints; i++) {
    for (let c = 0; c < 3; c++) {
      let val = Math.round(positions[i][c] * fractScale)
      // Convert to unsigned 24-bit representation
      if (val < 0) val += 0x1000000
      raw[offset] = val & 0xff
      raw[offset + 1] = (val >> 8) & 0xff
      raw[offset + 2] = (val >> 16) & 0xff
      offset += 3
    }
  }

  // Alphas: inverse sigmoid encoding → byte = round((log(o/(1-o)) + 6) / 12 * 255)
  for (let i = 0; i < numPoints; i++) {
    const o = Math.max(0.001, Math.min(0.999, opacities[i]))
    const logit = Math.log(o / (1 - o))
    const byteVal = Math.round((logit + 6.0) / 12.0 * 255)
    raw[offset++] = Math.max(0, Math.min(255, byteVal))
  }

  // Colors: uint8 RGB
  for (let i = 0; i < numPoints; i++) {
    raw[offset++] = Math.round(colors[i][0] * 255)
    raw[offset++] = Math.round(colors[i][1] * 255)
    raw[offset++] = Math.round(colors[i][2] * 255)
  }

  // Scales: log-encoded uint8 → byte = round(log(s) * 16 + 128)
  for (let i = 0; i < numPoints; i++) {
    for (let c = 0; c < 3; c++) {
      const s = Math.max(1e-10, scales[i][c])
      const byteVal = Math.round(Math.log(s) * 16 + 128)
      raw[offset++] = Math.max(0, Math.min(255, byteVal))
    }
  }

  // Rotations v2: "first three" — xyz encoded as uint8: byte = round((val + 1) * 127.5)
  for (let i = 0; i < numPoints; i++) {
    // rotations[i] = [w, x, y, z]
    raw[offset++] = Math.round((rotations[i][1] + 1) * 127.5) // x
    raw[offset++] = Math.round((rotations[i][2] + 1) * 127.5) // y
    raw[offset++] = Math.round((rotations[i][3] + 1) * 127.5) // z
  }

  return raw
}

describe('parseSpz', () => {
  it('decodes a synthetic SPZ v2 file with 1 splat', async () => {
    const raw = buildRawSpz({
      numPoints: 1,
      fractionalBits: 12,
      positions: [[1.0, 2.0, 3.0]],
      opacities: [0.5],
      colors: [[0.5, 0.5, 0.5]],
      scales: [[1.0, 1.0, 1.0]],
      rotations: [[1.0, 0.0, 0.0, 0.0]], // identity quaternion
    })

    const compressed = await gzipCompress(raw)
    const result = await parseSpz(compressed)

    expect(result.count).toBe(1)

    // Position — 24-bit fixed-point with 12 fractional bits
    // Precision: 1/4096 ≈ 0.000244
    expect(result.positions[0]).toBeCloseTo(1.0, 3)
    expect(result.positions[1]).toBeCloseTo(2.0, 3)
    expect(result.positions[2]).toBeCloseTo(3.0, 3)

    // Opacity — inverse sigmoid roundtrip (byte quantization limits precision)
    expect(result.opacities[0]).toBeCloseTo(0.5, 1)

    // Colors — uint8 roundtrip
    expect(result.colors[0]).toBeCloseTo(0.5, 1)
    expect(result.colors[1]).toBeCloseTo(0.5, 1)
    expect(result.colors[2]).toBeCloseTo(0.5, 1)

    // Scales — log-encoded roundtrip: exp((byte - 128) / 16)
    // For s=1.0: byte=round(log(1)*16+128)=128, decode=exp(0)=1.0
    expect(result.scales[0]).toBeCloseTo(1.0, 1)
    expect(result.scales[1]).toBeCloseTo(1.0, 1)
    expect(result.scales[2]).toBeCloseTo(1.0, 1)

    // Rotation — identity quaternion (w=1, x=0, y=0, z=0)
    // V2 encodes xyz as uint8 → quantization error
    const rw = result.rotations[0]
    const rx = result.rotations[1]
    const ry = result.rotations[2]
    const rz = result.rotations[3]
    const len = Math.sqrt(rw * rw + rx * rx + ry * ry + rz * rz)
    expect(len).toBeCloseTo(1.0)
    expect(rw).toBeCloseTo(1.0, 1)
    expect(Math.abs(rx)).toBeLessThan(0.02)
    expect(Math.abs(ry)).toBeLessThan(0.02)
    expect(Math.abs(rz)).toBeLessThan(0.02)

    // No SH1 for degree 0
    expect(result.sh1).toBeNull()
  })

  it('rejects data with invalid SPZ magic bytes', async () => {
    // 16 bytes of zeros (wrong magic), then gzip it
    const badData = new Uint8Array(16)
    const compressed = await gzipCompress(badData)

    await expect(parseSpz(compressed)).rejects.toThrow(/[Ii]nvalid SPZ magic/)
  })

  it('rejects non-gzip input', async () => {
    // Plain (non-gzipped) data — will fail validation at gzip magic check
    const raw = new Uint8Array(32)
    // The first check is for gzip magic (0x1f, 0x8b)
    await expect(parseSpz(raw.buffer)).rejects.toThrow(/gzip|magic/)
  })

  it('decodes positions with various fractionalBits accurately', async () => {
    const raw = buildRawSpz({
      numPoints: 1,
      fractionalBits: 8, // coarser precision: 1/256
      positions: [[10.5, -5.25, 0.0]],
      opacities: [0.5],
      colors: [[0.5, 0.5, 0.5]],
      scales: [[1.0, 1.0, 1.0]],
      rotations: [[1.0, 0.0, 0.0, 0.0]],
    })

    const compressed = await gzipCompress(raw)
    const result = await parseSpz(compressed)

    // With 8 fractional bits, precision is 1/256 ≈ 0.004
    expect(result.positions[0]).toBeCloseTo(10.5, 1)
    expect(result.positions[1]).toBeCloseTo(-5.25, 1)
    expect(result.positions[2]).toBeCloseTo(0.0, 1)
  })

  it('decodes multiple splats', async () => {
    const raw = buildRawSpz({
      numPoints: 3,
      fractionalBits: 12,
      positions: [[1.0, 0.0, 0.0], [0.0, 2.0, 0.0], [0.0, 0.0, 3.0]],
      opacities: [0.9, 0.5, 0.1],
      colors: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
      scales: [[0.5, 0.5, 0.5], [1.0, 1.0, 1.0], [2.0, 2.0, 2.0]],
      rotations: [
        [1.0, 0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0, 0.0],
      ],
    })

    const compressed = await gzipCompress(raw)
    const result = await parseSpz(compressed)

    expect(result.count).toBe(3)

    // Check that each splat's position decoded correctly
    expect(result.positions[0]).toBeCloseTo(1.0, 2)
    expect(result.positions[3 + 1]).toBeCloseTo(2.0, 2)
    expect(result.positions[6 + 2]).toBeCloseTo(3.0, 2)

    // Check colors
    expect(result.colors[0]).toBeCloseTo(1.0, 1)
    expect(result.colors[4]).toBeCloseTo(1.0, 1) // green of splat 2
    expect(result.colors[8]).toBeCloseTo(1.0, 1) // blue of splat 3
  })
})
