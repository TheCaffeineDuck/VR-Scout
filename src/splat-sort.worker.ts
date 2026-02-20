// Web Worker: CPU depth sort for Gaussian splats
// Pure TypeScript/math — no Three.js imports allowed here
// Cast to any to access postMessage with transferables (worker-specific signature)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerSelf = self as any

let storedPositions: Float32Array | null = null
let storedCount = 0

// Pre-allocated sort buffers — created once in init, reused every sort
let distancesBuffer: Float32Array | null = null
let indicesBuffer: Uint32Array | null = null
let tempIndicesBuffer: Uint32Array | null = null

// 16-bit radix sort (two passes: low 16 bits, high 16 bits)
// Sorts indices so that distances are in ascending order (front-to-back for ONE_MINUS_DST_ALPHA blending)
function radixSort16(indices: Uint32Array, distances: Float32Array, count: number, tempIndices: Uint32Array): void {
  // Since all distances are squared (non-negative), the float bit pattern already
  // maintains the same order as the float value. We can sort by reinterpreted bits.
  // Reinterpret float32 bits as uint32 for integer comparison.
  const distBits = new Uint32Array(distances.buffer, distances.byteOffset, count)

  const RADIX = 65536 // 2^16
  const MASK = 0xFFFF

  // Two passes: low 16 bits, then high 16 bits
  // Sort ascending by distBits → front-to-back (nearest first)
  for (let pass = 0; pass < 2; pass++) {
    const shift = pass * 16
    const count16 = new Int32Array(RADIX)

    // Count occurrences of each 16-bit key
    for (let i = 0; i < count; i++) {
      const key = (distBits[indices[i]] >>> shift) & MASK
      count16[key]++
    }

    // Prefix sum (exclusive scan)
    let total = 0
    for (let i = 0; i < RADIX; i++) {
      const c = count16[i]
      count16[i] = total
      total += c
    }

    // Scatter
    for (let i = 0; i < count; i++) {
      const key = (distBits[indices[i]] >>> shift) & MASK
      tempIndices[count16[key]++] = indices[i]
    }

    // Copy back
    indices.set(tempIndices)
  }

  // After two ascending passes the array is sorted ascending (nearest first) = front-to-back.
  // No reversal needed — front-to-back order for ONE_MINUS_DST_ALPHA blending.
}

workerSelf.onmessage = (e: MessageEvent) => {
  const msg = e.data

  if (msg.type === 'init') {
    storedPositions = msg.positions as Float32Array
    storedCount = msg.count as number

    // Pre-allocate sort buffers once — avoids ~12MB of GC pressure per sort
    distancesBuffer = new Float32Array(storedCount)
    indicesBuffer = new Uint32Array(storedCount)
    tempIndicesBuffer = new Uint32Array(storedCount)
    return
  }

  if (msg.type === 'sort') {
    if (!storedPositions || storedCount === 0 || !distancesBuffer || !indicesBuffer || !tempIndicesBuffer) return

    const { camX, camY, camZ } = msg
    const count = storedCount
    const positions = storedPositions
    const distances = distancesBuffer
    const indices = indicesBuffer

    for (let i = 0; i < count; i++) {
      const dx = positions[i * 3]     - camX
      const dy = positions[i * 3 + 1] - camY
      const dz = positions[i * 3 + 2] - camZ
      distances[i] = dx * dx + dy * dy + dz * dz
      indices[i] = i
    }

    radixSort16(indices, distances, count, tempIndicesBuffer)

    // Transfer indicesBuffer directly — zero-copy, no allocation per sort.
    // After postMessage with transfer, the buffer is detached, so re-allocate for next cycle.
    indicesBuffer = null
    workerSelf.postMessage({ indices: indices }, [indices.buffer])
    // Re-allocate for next sort (cheap: one allocation per frame vs. copy + allocation before)
    indicesBuffer = new Uint32Array(storedCount)
  }
}
