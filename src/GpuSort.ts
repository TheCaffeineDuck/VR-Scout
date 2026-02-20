/**
 * GpuSort — 4-pass LSD Radix Sort via TSL compute shaders.
 *
 * Replaces BitonicSort (O(N log²N)) with an O(4N) algorithm.
 * Each pass sorts 8 bits of the key (256 buckets).
 *
 * Per-pass pipeline:
 *   1. clearHist  — zero the 256-entry global histogram
 *   2. histogram  — each thread atomicAdds its digit bucket
 *   3. prefixSum  — single-thread exclusive prefix sum over 256 entries
 *   4. scatter    — each thread atomicAdds its bucket offset to find output slot
 *
 * Key encoding:
 *   key = ~floatBitsToUint(distSq)
 *   For non-negative float32, the bit pattern is monotonically ordered with
 *   distance.  Bitwise NOT inverts the ordering so that ascending sort on the
 *   key produces back-to-front (farthest first) output.
 *   Padded slots: key = 0  → they sort to the end after inversion.
 *
 * Ping-pong buffers (A ↔ B):
 *   pass 0: A → B
 *   pass 1: B → A
 *   pass 2: A → B
 *   pass 3: B → A      ← final sorted output lives in idxBufA
 *
 * Public interface (same as old GpuSort):
 *   indexBuffer  — sorted indices (uint, vertex shader reads this directly)
 *   sort()       — throttled sort
 *   sortForce()  — unconditional sort
 *   dispose()    — free GPU storage
 */

import * as THREE from 'three/webgpu'
import {
  Fn, instanceIndex, uint,
  instancedArray, uniform,
  atomicAdd, atomicStore, atomicLoad, Loop, If, select,
  floatBitsToUint,
} from 'three/tsl'

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const RADIX_BITS = 8
const RADIX_SIZE = 1 << RADIX_BITS  // 256 buckets

// Workgroup size for histogram / scatter.  Must match WG_SIZE in the shaders.
// 256 threads per workgroup is a safe, widely-supported size.
const WG_SIZE = 256

// Number of passes for a 32-bit key (8 bits/pass × 4 = 32 bits)
const NUM_PASSES = 4

function nextMultiple(n: number, align: number): number {
  return Math.ceil(n / align) * align
}

// -------------------------------------------------------------------------
// GpuSort
// -------------------------------------------------------------------------

export class GpuSort {
  /**
   * Final sorted index buffer.
   * Vertex shader reads: splatIndex = indexBuffer.element(instanceIndex).toInt()
   * (No bit-masking — full 32-bit indices.)
   */
  readonly indexBuffer: ReturnType<typeof instancedArray>

  private readonly keyBufA: ReturnType<typeof instancedArray>
  private readonly keyBufB: ReturnType<typeof instancedArray>
  private readonly idxBufA: ReturnType<typeof instancedArray>
  private readonly idxBufB: ReturnType<typeof instancedArray>

  // Histogram: 256 uint32 counters, marked atomic so WGSL generates atomic<u32>
  private readonly histBuf: ReturnType<typeof instancedArray>

  private readonly count: number
  private readonly paddedCount: number

  private readonly camPosNode: any
  // maxDistSqNode kept for API compat but not needed with bitwise-NOT encoding
  private readonly maxDistSqNode: any

  // Pre-built compute nodes
  private computeDistancesNode: any
  private clearHistNode: any
  private computePrefixSumNode: any
  private computeHistogramNodes: any[]
  private computeScatterNodes: any[]

  private lastCamPos = new THREE.Vector3(Infinity, Infinity, Infinity)

  // Storage buffers for positions (avoids textureLoad in compute which may not work)
  private readonly posXBuf: ReturnType<typeof instancedArray>
  private readonly posYBuf: ReturnType<typeof instancedArray>
  private readonly posZBuf: ReturnType<typeof instancedArray>

  constructor(
    count: number,
    positionTex: THREE.DataTexture,
    texWidth: number,
    _texHeight: number,
    renderer: THREE.WebGPURenderer,
    maxExtent: number = 100
  ) {
    void renderer
    this.count = count
    this.paddedCount = nextMultiple(count, WG_SIZE)

    this.camPosNode   = uniform(new THREE.Vector3(), 'vec3')
    this.maxDistSqNode = uniform(maxExtent * maxExtent, 'float')

    // Key ping-pong buffers (uint32)
    this.keyBufA = instancedArray(this.paddedCount, 'uint')
    this.keyBufB = instancedArray(this.paddedCount, 'uint')
    // Index ping-pong buffers (uint32)
    this.idxBufA = instancedArray(this.paddedCount, 'uint')
    this.idxBufB = instancedArray(this.paddedCount, 'uint')

    // Histogram buffer — mark atomic so WGSL emits atomic<u32>
    this.histBuf = instancedArray(RADIX_SIZE, 'uint').toAtomic()

    // Position storage buffers — textureLoad() in compute shaders is unreliable,
    // so we copy XYZ into separate float storage buffers for the distance compute.
    const texData = positionTex.image.data as Float32Array
    const texW = positionTex.image.width
    const texH = positionTex.image.height
    const texelCount = texW * texH

    const pxArr = new Float32Array(this.paddedCount)
    const pyArr = new Float32Array(this.paddedCount)
    const pzArr = new Float32Array(this.paddedCount)
    for (let i = 0; i < count; i++) {
      pxArr[i] = texData[i * 4]
      pyArr[i] = texData[i * 4 + 1]
      pzArr[i] = texData[i * 4 + 2]
    }
    this.posXBuf = instancedArray(pxArr, 'float')
    this.posYBuf = instancedArray(pyArr, 'float')
    this.posZBuf = instancedArray(pzArr, 'float')

    // Final output is idxBufA (pass sequence A→B→A→B→A over 4 passes means A wins)
    this.indexBuffer = this.idxBufA

    this.computeHistogramNodes = []
    this.computeScatterNodes   = []

    this._buildComputeNodes()

    console.log(
      `[GpuSort] Radix sort: ${count} splats, padded=${this.paddedCount}` +
      `, maxExtent=${maxExtent.toFixed(1)}`
    )
  }

  // -------------------------------------------------------------------------
  // Build TSL compute nodes
  // -------------------------------------------------------------------------

  private _buildComputeNodes(): void {
    const count      = this.count
    const padded     = this.paddedCount
    const camPos     = this.camPosNode
    const splatCount = uint(count)
    const keyA = this.keyBufA, keyB = this.keyBufB
    const idxA = this.idxBufA, idxB = this.idxBufB
    const hist = this.histBuf
    const posX = this.posXBuf, posY = this.posYBuf, posZ = this.posZBuf

    // ------------------------------------------------------------------
    // Step 0: Compute distance keys + initialise identity permutation.
    //   key = floatBitsToUint(distSq)
    //   Small distSq → small uint → sorts FIRST (ascending = front-to-back) ✓
    //   Padded slots → key = 0xFFFFFFFF → sort to END ✓
    // ------------------------------------------------------------------

    this.computeDistancesNode = Fn(() => {
      const i = instanceIndex.toUint()

      // Padded sentinel: 0xFFFFFFFF sorts to the end (largest uint)
      const isPadded = i.greaterThanEqual(splatCount)

      // Read position from storage buffers (textureLoad unreliable in compute)
      const px = posX.element(i)
      const py = posY.element(i)
      const pz = posZ.element(i)
      const dx = px.sub(camPos.x)
      const dy = py.sub(camPos.y)
      const dz = pz.sub(camPos.z)
      const distSqF = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz))

      // For non-negative float, bit-reinterpret as uint is monotonic with distance.
      // Ascending sort of raw uint = front-to-back (nearest first).
      // CRITICAL: floatBitsToUint() does a bitcast (reinterprets float bits as uint),
      // NOT a value cast (.toUint() truncates the float value to an integer).
      const sortKey = floatBitsToUint(distSqF)

      // Padded: assign 0xFFFFFFFF so they sort to end
      keyA.element(i).assign(select(isPadded, uint(0xFFFFFFFF), sortKey))
      // Identity permutation: each slot starts pointing to itself
      idxA.element(i).assign(select(isPadded, splatCount, i))
    })().compute(padded, [WG_SIZE])

    // ------------------------------------------------------------------
    // Clear histogram — 256 threads, each zeros one entry
    // ------------------------------------------------------------------

    this.clearHistNode = Fn(() => {
      const i = instanceIndex.toUint()
      atomicStore(hist.element(i), uint(0))
    })().compute(RADIX_SIZE, [RADIX_SIZE])

    // ------------------------------------------------------------------
    // Prefix sum — single thread computes exclusive prefix sum in-place.
    // 256 entries is tiny; sequential compute is negligible.
    // ------------------------------------------------------------------

    this.computePrefixSumNode = Fn(() => {
      // Only thread 0 does work
      If(instanceIndex.notEqual(uint(0)), () => { return })

      // Exclusive prefix sum: out[i] = sum(hist[0..i-1])
      // Step 1: accumulate inclusive sums while saving originals
      // We only have the global buffer — do two-pass in-place.
      //   Pass A: running sum, write inclusive prefix back
      //   Pass B: shift right by one to get exclusive
      //
      // TSL Loop syntax: Loop( count, ({ i }) => { ... } )
      // i counts 0..count-1 as an int node.
      const runSum = uint(0).toVar()

      Loop(RADIX_SIZE, ({ i }: { i: any }) => {
        const idx = i.toUint()
        const old = atomicLoad(hist.element(idx))
        atomicStore(hist.element(idx), runSum)
        runSum.addAssign(old)
      })
    })().compute(1, [1])

    // ------------------------------------------------------------------
    // Per-pass histogram + scatter nodes
    // ------------------------------------------------------------------

    for (let pass = 0; pass < NUM_PASSES; pass++) {
      const bitShift  = uint(pass * RADIX_BITS)
      const srcKey    = pass % 2 === 0 ? keyA : keyB
      const srcIdx    = pass % 2 === 0 ? idxA : idxB
      const dstKey    = pass % 2 === 0 ? keyB : keyA
      const dstIdx    = pass % 2 === 0 ? idxB : idxA

      // Histogram: count occurrences of each 8-bit digit
      this.computeHistogramNodes.push(
        Fn(() => {
          const i = instanceIndex.toUint()
          If(i.greaterThanEqual(splatCount), () => { return })
          const digit = srcKey.element(i).shiftRight(bitShift).bitAnd(uint(RADIX_SIZE - 1))
          atomicAdd(hist.element(digit), uint(1))
        })().compute(padded, [WG_SIZE])
      )

      // Scatter: each thread claims a slot via atomicAdd on the prefix-sum offset
      this.computeScatterNodes.push(
        Fn(() => {
          const i = instanceIndex.toUint()
          If(i.greaterThanEqual(splatCount), () => { return })
          const key   = srcKey.element(i)
          const idx   = srcIdx.element(i)
          const digit = key.shiftRight(bitShift).bitAnd(uint(RADIX_SIZE - 1))
          const slot  = atomicAdd(hist.element(digit), uint(1))
          dstKey.element(slot).assign(key)
          dstIdx.element(slot).assign(idx)
        })().compute(padded, [WG_SIZE])
      )
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  sort(camPos: THREE.Vector3, renderer: THREE.WebGPURenderer): boolean {
    const dx = camPos.x - this.lastCamPos.x
    const dy = camPos.y - this.lastCamPos.y
    const dz = camPos.z - this.lastCamPos.z
    if (dx * dx + dy * dy + dz * dz < 0.01) return false
    this.lastCamPos.copy(camPos)
    this._doSort(camPos, renderer)
    return true
  }

  sortForce(camPos: THREE.Vector3, renderer: THREE.WebGPURenderer): void {
    this.lastCamPos.set(Infinity, Infinity, Infinity)
    this._doSort(camPos, renderer)
  }

  private _doSort(camPos: THREE.Vector3, renderer: THREE.WebGPURenderer): void {
    this.camPosNode.value.copy(camPos)

    const t0 = performance.now()

    // Compute distances + initialise index permutation
    renderer.compute(this.computeDistancesNode)

    // 4 radix passes
    for (let pass = 0; pass < NUM_PASSES; pass++) {
      renderer.compute(this.clearHistNode)
      renderer.compute(this.computeHistogramNodes[pass])
      renderer.compute(this.computePrefixSumNode)
      renderer.compute(this.computeScatterNodes[pass])
    }

    const dt = performance.now() - t0
    if ((window as any).__debugSort) {
      console.log(`[GpuSort] sort time: ${dt.toFixed(2)}ms (${this.count} splats)`)
    }
  }

  dispose(): void {
    for (const buf of [this.keyBufA, this.keyBufB, this.idxBufA, this.idxBufB, this.histBuf, this.posXBuf, this.posYBuf, this.posZBuf]) {
      const b = (buf as any).value
      if (b && typeof b.dispose === 'function') b.dispose()
    }
  }
}
