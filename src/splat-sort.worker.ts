// Web Worker: CPU depth sort for Gaussian splats
// Pure TypeScript/math — no Three.js imports allowed here
// Cast to any to access postMessage with transferables (worker-specific signature)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerSelf = self as any

let storedPositions: Float32Array | null = null
let storedCount = 0

// 16-bit radix sort (two passes: low 16 bits, high 16 bits)
// Sorts indices so that distances are in descending order (back-to-front for alpha blending)
function radixSort16(indices: Uint32Array, distances: Float32Array, count: number): void {
  // Since all distances are squared (non-negative), the float bit pattern already
  // maintains the same order as the float value. We can sort by reinterpreted bits.
  // Reinterpret float32 bits as uint32 for integer comparison.
  const distBits = new Uint32Array(distances.buffer, distances.byteOffset, count)

  const RADIX = 65536 // 2^16
  const MASK = 0xFFFF

  const tempIndices = new Uint32Array(count)

  // Two passes: low 16 bits, then high 16 bits
  // After sorting ascending by distBits, reverse for back-to-front (farthest first)
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

  // After two ascending passes the array is sorted ascending (nearest first).
  // Reverse in-place to get back-to-front (farthest first).
  for (let lo = 0, hi = count - 1; lo < hi; lo++, hi--) {
    const tmp = indices[lo]
    indices[lo] = indices[hi]
    indices[hi] = tmp
  }
}

workerSelf.onmessage = (e: MessageEvent) => {
  const msg = e.data

  if (msg.type === 'init') {
    storedPositions = msg.positions as Float32Array
    storedCount = msg.count as number
    return
  }

  if (msg.type === 'sort') {
    if (!storedPositions || storedCount === 0) return

    const { camX, camY, camZ } = msg
    const count = storedCount
    const positions = storedPositions

    const distances = new Float32Array(count)
    const indices = new Uint32Array(count)

    for (let i = 0; i < count; i++) {
      const dx = positions[i * 3]     - camX
      const dy = positions[i * 3 + 1] - camY
      const dz = positions[i * 3 + 2] - camZ
      distances[i] = dx * dx + dy * dy + dz * dz
      indices[i] = i
    }

    radixSort16(indices, distances, count)

    // Transfer the buffer back zero-copy
    workerSelf.postMessage({ indices }, [indices.buffer])
  }
}
