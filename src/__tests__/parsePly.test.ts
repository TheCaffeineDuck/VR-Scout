import { describe, it, expect } from 'vitest'
import { parsePly } from '../formats/parsePly'

const SH_C0 = 0.28209479177387814

/**
 * Build a minimal binary PLY buffer from a header string and float32 body data.
 */
function buildPlyBuffer(header: string, data: Float32Array): ArrayBuffer {
  const headerBytes = new TextEncoder().encode(header)
  const result = new Uint8Array(headerBytes.length + data.byteLength)
  result.set(headerBytes)
  result.set(new Uint8Array(data.buffer), headerBytes.length)
  return result.buffer
}

describe('parsePly', () => {
  it('decodes a minimal valid PLY with 1 vertex', () => {
    const header =
      'ply\n' +
      'format binary_little_endian 1.0\n' +
      'element vertex 1\n' +
      'property float x\n' +
      'property float y\n' +
      'property float z\n' +
      'property float scale_0\n' +
      'property float scale_1\n' +
      'property float scale_2\n' +
      'property float rot_0\n' +
      'property float rot_1\n' +
      'property float rot_2\n' +
      'property float rot_3\n' +
      'property float f_dc_0\n' +
      'property float f_dc_1\n' +
      'property float f_dc_2\n' +
      'property float opacity\n' +
      'end_header\n'

    // 14 float32 values:
    // pos(1,2,3) scale(0,0,0) rot(1,0,0,0) f_dc(0,0,0) opacity(0)
    const body = new Float32Array([
      1.0, 2.0, 3.0,        // position
      0.0, 0.0, 0.0,        // scale (log-space → exp(0) = 1.0)
      1.0, 0.0, 0.0, 0.0,   // rotation (w, x, y, z) — identity
      0.0, 0.0, 0.0,        // f_dc (SH color → 0.5 + SH_C0 * 0 = 0.5)
      0.0,                   // opacity logit (sigmoid(0) = 0.5)
    ])

    const buf = buildPlyBuffer(header, body)
    const result = parsePly(buf)

    expect(result.count).toBe(1)

    // Positions — direct
    expect(result.positions[0]).toBeCloseTo(1.0)
    expect(result.positions[1]).toBeCloseTo(2.0)
    expect(result.positions[2]).toBeCloseTo(3.0)

    // Scales — exp(0) = 1.0
    expect(result.scales[0]).toBeCloseTo(1.0)
    expect(result.scales[1]).toBeCloseTo(1.0)
    expect(result.scales[2]).toBeCloseTo(1.0)

    // Colors — 0.5 + SH_C0 * 0 = 0.5
    expect(result.colors[0]).toBeCloseTo(0.5)
    expect(result.colors[1]).toBeCloseTo(0.5)
    expect(result.colors[2]).toBeCloseTo(0.5)

    // Opacity — sigmoid(0) = 0.5
    expect(result.opacities[0]).toBeCloseTo(0.5)

    // Rotation — normalized identity quaternion
    expect(result.rotations[0]).toBeCloseTo(1.0) // w
    expect(result.rotations[1]).toBeCloseTo(0.0) // x
    expect(result.rotations[2]).toBeCloseTo(0.0) // y
    expect(result.rotations[3]).toBeCloseTo(0.0) // z

    // No SH1
    expect(result.sh1).toBeNull()
  })

  it('detects SH1 properties (f_rest_0 through f_rest_8)', () => {
    const header =
      'ply\n' +
      'format binary_little_endian 1.0\n' +
      'element vertex 1\n' +
      'property float x\n' +
      'property float y\n' +
      'property float z\n' +
      'property float scale_0\n' +
      'property float scale_1\n' +
      'property float scale_2\n' +
      'property float rot_0\n' +
      'property float rot_1\n' +
      'property float rot_2\n' +
      'property float rot_3\n' +
      'property float f_dc_0\n' +
      'property float f_dc_1\n' +
      'property float f_dc_2\n' +
      'property float opacity\n' +
      'property float f_rest_0\n' +
      'property float f_rest_1\n' +
      'property float f_rest_2\n' +
      'property float f_rest_3\n' +
      'property float f_rest_4\n' +
      'property float f_rest_5\n' +
      'property float f_rest_6\n' +
      'property float f_rest_7\n' +
      'property float f_rest_8\n' +
      'end_header\n'

    // 23 float32 values (14 base + 9 SH1)
    const body = new Float32Array([
      1.0, 2.0, 3.0,        // position
      0.0, 0.0, 0.0,        // scale
      1.0, 0.0, 0.0, 0.0,   // rotation
      0.0, 0.0, 0.0,        // f_dc
      0.0,                   // opacity
      0.1, 0.2, 0.3,        // f_rest_0..2 (red SH1 coefficients)
      0.4, 0.5, 0.6,        // f_rest_3..5 (green SH1 coefficients)
      0.7, 0.8, 0.9,        // f_rest_6..8 (blue SH1 coefficients)
    ])

    const buf = buildPlyBuffer(header, body)
    const result = parsePly(buf)

    expect(result.count).toBe(1)
    expect(result.sh1).not.toBeNull()
    expect(result.sh1!.length).toBe(9)

    // SH1 layout: [r0,r1,r2, g0,g1,g2, b0,b1,b2]
    // f_rest_0..2 → red, f_rest_3..5 → green, f_rest_6..8 → blue
    expect(result.sh1![0]).toBeCloseTo(0.1) // r0
    expect(result.sh1![1]).toBeCloseTo(0.2) // r1
    expect(result.sh1![2]).toBeCloseTo(0.3) // r2
    expect(result.sh1![3]).toBeCloseTo(0.4) // g0
    expect(result.sh1![4]).toBeCloseTo(0.5) // g1
    expect(result.sh1![5]).toBeCloseTo(0.6) // g2
    expect(result.sh1![6]).toBeCloseTo(0.7) // b0
    expect(result.sh1![7]).toBeCloseTo(0.8) // b1
    expect(result.sh1![8]).toBeCloseTo(0.9) // b2
  })

  it('throws on unsupported format (ASCII)', () => {
    const header =
      'ply\n' +
      'format ascii 1.0\n' +
      'element vertex 1\n' +
      'property float x\n' +
      'end_header\n'

    const body = new Float32Array([1.0])
    const buf = buildPlyBuffer(header, body)

    expect(() => parsePly(buf)).toThrow('Unsupported PLY format')
  })

  it('correctly applies SH_C0 to color values', () => {
    const header =
      'ply\n' +
      'format binary_little_endian 1.0\n' +
      'element vertex 1\n' +
      'property float x\n' +
      'property float y\n' +
      'property float z\n' +
      'property float scale_0\n' +
      'property float scale_1\n' +
      'property float scale_2\n' +
      'property float rot_0\n' +
      'property float rot_1\n' +
      'property float rot_2\n' +
      'property float rot_3\n' +
      'property float f_dc_0\n' +
      'property float f_dc_1\n' +
      'property float f_dc_2\n' +
      'property float opacity\n' +
      'end_header\n'

    // f_dc values of 1.0 → color = 0.5 + SH_C0 * 1.0
    const body = new Float32Array([
      0.0, 0.0, 0.0,        // position
      0.0, 0.0, 0.0,        // scale
      1.0, 0.0, 0.0, 0.0,   // rotation
      1.0, 2.0, -1.0,       // f_dc values
      0.0,                   // opacity
    ])

    const buf = buildPlyBuffer(header, body)
    const result = parsePly(buf)

    expect(result.colors[0]).toBeCloseTo(0.5 + SH_C0 * 1.0)
    expect(result.colors[1]).toBeCloseTo(0.5 + SH_C0 * 2.0)
    expect(result.colors[2]).toBeCloseTo(0.5 + SH_C0 * -1.0)
  })

  it('correctly applies sigmoid to opacity', () => {
    const header =
      'ply\n' +
      'format binary_little_endian 1.0\n' +
      'element vertex 1\n' +
      'property float x\n' +
      'property float y\n' +
      'property float z\n' +
      'property float scale_0\n' +
      'property float scale_1\n' +
      'property float scale_2\n' +
      'property float rot_0\n' +
      'property float rot_1\n' +
      'property float rot_2\n' +
      'property float rot_3\n' +
      'property float f_dc_0\n' +
      'property float f_dc_1\n' +
      'property float f_dc_2\n' +
      'property float opacity\n' +
      'end_header\n'

    // opacity logit = 2.0 → sigmoid(2) ≈ 0.8808
    const body = new Float32Array([
      0.0, 0.0, 0.0,
      0.0, 0.0, 0.0,
      1.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0,
      2.0,
    ])

    const buf = buildPlyBuffer(header, body)
    const result = parsePly(buf)

    expect(result.opacities[0]).toBeCloseTo(1.0 / (1.0 + Math.exp(-2.0)))
  })
})
