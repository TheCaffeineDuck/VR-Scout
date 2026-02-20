import { describe, it, expect } from 'vitest'

// NOTE: The GPU radix sort (GpuSort.ts) requires a WebGPU context and cannot
// be tested in a Node.js/Vitest environment. Only the CPU sort is tested here.

/**
 * Reimplementation of the radixSort16 function from splat-sort.worker.ts
 * for testability. The worker version is identical but tightly coupled to
 * the Web Worker message API. This is a pure function copy.
 */
function radixSort16(
  indices: Uint32Array,
  distances: Float32Array,
  count: number,
  tempIndices: Uint32Array,
): void {
  const distBits = new Uint32Array(distances.buffer, distances.byteOffset, count)

  const RADIX = 65536
  const MASK = 0xffff

  for (let pass = 0; pass < 2; pass++) {
    const shift = pass * 16
    const count16 = new Int32Array(RADIX)

    for (let i = 0; i < count; i++) {
      const key = (distBits[indices[i]] >>> shift) & MASK
      count16[key]++
    }

    let total = 0
    for (let i = 0; i < RADIX; i++) {
      const c = count16[i]
      count16[i] = total
      total += c
    }

    for (let i = 0; i < count; i++) {
      const key = (distBits[indices[i]] >>> shift) & MASK
      tempIndices[count16[key]++] = indices[i]
    }

    indices.set(tempIndices)
  }

  // Reverse in-place for back-to-front (farthest first)
  for (let lo = 0, hi = count - 1; lo < hi; lo++, hi--) {
    const tmp = indices[lo]
    indices[lo] = indices[hi]
    indices[hi] = tmp
  }
}

/**
 * Helper: compute squared distance from position at index `idx` to camera.
 */
function distanceSq(positions: Float32Array, idx: number, camX: number, camY: number, camZ: number): number {
  const dx = positions[idx * 3] - camX
  const dy = positions[idx * 3 + 1] - camY
  const dz = positions[idx * 3 + 2] - camZ
  return dx * dx + dy * dy + dz * dz
}

/**
 * Helper: run the full sort pipeline (compute distances → sort).
 */
function sortSplats(
  positions: Float32Array,
  count: number,
  camX: number,
  camY: number,
  camZ: number,
): Uint32Array {
  const distances = new Float32Array(count)
  const indices = new Uint32Array(count)
  const temp = new Uint32Array(count)

  for (let i = 0; i < count; i++) {
    const dx = positions[i * 3] - camX
    const dy = positions[i * 3 + 1] - camY
    const dz = positions[i * 3 + 2] - camZ
    distances[i] = dx * dx + dy * dy + dz * dz
    indices[i] = i
  }

  radixSort16(indices, distances, count, temp)
  return indices
}

describe('CPU radix sort (radixSort16)', () => {
  it('produces back-to-front ordering along Z axis', () => {
    // 5 splats at z = 0, 2, 4, 6, 8 (all x=0, y=0)
    // Camera at (0, 0, 10) looking toward origin
    const count = 5
    const positions = new Float32Array([
      0, 0, 0, // splat 0 — distance 100
      0, 0, 2, // splat 1 — distance 64
      0, 0, 4, // splat 2 — distance 36
      0, 0, 6, // splat 3 — distance 16
      0, 0, 8, // splat 4 — distance 4
    ])

    const indices = sortSplats(positions, count, 0, 0, 10)

    // Back-to-front: farthest first → splat 0 (dist 100) should come first
    expect(indices[0]).toBe(0)
    expect(indices[1]).toBe(1)
    expect(indices[2]).toBe(2)
    expect(indices[3]).toBe(3)
    expect(indices[4]).toBe(4)

    // Verify ordering property: each subsequent splat is closer
    for (let i = 1; i < count; i++) {
      const prevDist = distanceSq(positions, indices[i - 1], 0, 0, 10)
      const currDist = distanceSq(positions, indices[i], 0, 0, 10)
      expect(prevDist).toBeGreaterThanOrEqual(currDist)
    }
  })

  it('handles a single splat', () => {
    const positions = new Float32Array([5, 5, 5])
    const indices = sortSplats(positions, 1, 0, 0, 0)

    expect(indices.length).toBe(1)
    expect(indices[0]).toBe(0)
  })

  it('handles all splats at the same distance', () => {
    // 4 splats all at distance sqrt(3) from origin
    const count = 4
    const positions = new Float32Array([
      1, 1, 1,
      -1, -1, 1,
      1, -1, -1,
      -1, 1, -1,
    ])

    const indices = sortSplats(positions, count, 0, 0, 0)

    // All indices should be present (no crash, no duplicates)
    const indexSet = new Set(Array.from(indices))
    expect(indexSet.size).toBe(count)
    for (let i = 0; i < count; i++) {
      expect(indexSet.has(i)).toBe(true)
    }
  })

  it('correctly sorts splats in 3D space', () => {
    // Splats at various 3D positions
    const count = 6
    const positions = new Float32Array([
      10, 0, 0,   // splat 0 — dist² = 100
      0, 10, 0,   // splat 1 — dist² = 100
      0, 0, 1,    // splat 2 — dist² = 1
      3, 4, 0,    // splat 3 — dist² = 25
      1, 1, 1,    // splat 4 — dist² = 3
      5, 5, 5,    // splat 5 — dist² = 75
    ])

    const indices = sortSplats(positions, count, 0, 0, 0)

    // Verify back-to-front: each dist >= next dist
    for (let i = 1; i < count; i++) {
      const prevDist = distanceSq(positions, indices[i - 1], 0, 0, 0)
      const currDist = distanceSq(positions, indices[i], 0, 0, 0)
      expect(prevDist).toBeGreaterThanOrEqual(currDist)
    }

    // Closest should be last: splat 2 (dist²=1)
    expect(indices[count - 1]).toBe(2)
  })

  it('handles larger random datasets without crash', () => {
    const count = 10000
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 200
    }

    const indices = sortSplats(positions, count, 0, 0, 0)

    // All indices present
    const indexSet = new Set(Array.from(indices))
    expect(indexSet.size).toBe(count)

    // Check ordering for a sample of indices
    for (let i = 1; i < Math.min(count, 100); i++) {
      const prevDist = distanceSq(positions, indices[i - 1], 0, 0, 0)
      const currDist = distanceSq(positions, indices[i], 0, 0, 0)
      expect(prevDist).toBeGreaterThanOrEqual(currDist)
    }
  })

  it('works with off-center camera', () => {
    const count = 3
    const positions = new Float32Array([
      0, 0, 0,    // dist² to (5,5,5) = 75
      10, 10, 10, // dist² to (5,5,5) = 75
      5, 5, 5,    // dist² to (5,5,5) = 0
    ])

    const indices = sortSplats(positions, count, 5, 5, 5)

    // Splat 2 is closest → should be last
    expect(indices[count - 1]).toBe(2)

    // Splats 0 and 1 are equidistant → order doesn't matter, both should be present
    const first2 = new Set([indices[0], indices[1]])
    expect(first2.has(0)).toBe(true)
    expect(first2.has(1)).toBe(true)
  })
})
