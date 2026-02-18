import * as THREE from 'three/webgpu'
import {
  Fn, instanceIndex, float, uint, int,
  instancedArray, uniform, textureLoad, ivec2, uvec2,
  select, workgroupArray, workgroupBarrier,
  invocationLocalIndex, workgroupId, Loop,
  min, max,
} from 'three/tsl'

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

// ---- Bitonic index helpers (same as Three.js BitonicSort) ----

const getBitonicFlipIndices = Fn(([index, blockHeight]: any[]) => {
  const blockOffset = index.mul(2).div(blockHeight).mul(blockHeight)
  const halfHeight = blockHeight.div(2)
  const idx = uvec2(
    index.mod(halfHeight),
    blockHeight.sub(index.mod(halfHeight)).sub(1)
  )
  idx.x.addAssign(blockOffset)
  idx.y.addAssign(blockOffset)
  return idx
}).setLayout({
  name: 'getBitonicFlipIndices',
  type: 'uvec2',
  inputs: [
    { name: 'index', type: 'uint' },
    { name: 'blockHeight', type: 'uint' },
  ],
})

const getBitonicDisperseIndices = Fn(([index, swapSpan]: any[]) => {
  const blockOffset = index.mul(2).div(swapSpan).mul(swapSpan)
  const halfHeight = swapSpan.div(2)
  const idx = uvec2(
    index.mod(halfHeight),
    index.mod(halfHeight).add(halfHeight)
  )
  idx.x.addAssign(blockOffset)
  idx.y.addAssign(blockOffset)
  return idx
}).setLayout({
  name: 'getBitonicDisperseIndices',
  type: 'uvec2',
  inputs: [
    { name: 'index', type: 'uint' },
    { name: 'blockHeight', type: 'uint' },
  ],
})

/**
 * GPU compute sort for Gaussian splats using bitonic sort.
 *
 * Sorts splats back-to-front (descending distance) entirely on the GPU.
 * The sorted index buffer is read directly by the vertex shader — no CPU upload.
 *
 * Adapted from Three.js BitonicSort, extended for key-value pairs (distance + index).
 * Uses CPU-driven stepping with a GPU-side infoStorage buffer for swap span state.
 *
 * Only works with native WebGPU backend.
 */
export class GpuSort {
  /** Sorted index buffer — vertex shader reads this directly */
  readonly indexBuffer: ReturnType<typeof instancedArray>

  private distanceBuffer: ReturnType<typeof instancedArray>
  private tempDistBuffer: ReturnType<typeof instancedArray>
  private tempIdxBuffer: ReturnType<typeof instancedArray>
  private infoStorage: ReturnType<typeof instancedArray>

  private computeDistancesNode: any
  private swapLocalNode: any
  private flipGlobalNodes!: { data: any; temp: any }
  private disperseGlobalNodes!: { data: any; temp: any }
  private disperseLocalNodes!: { data: any; temp: any }
  private alignNode: any
  private setAlgoNode: any
  private resetNode: any

  private readonly count: number
  private readonly paddedCount: number
  private readonly camPosUniform: THREE.Uniform<THREE.Vector3>
  private readonly dispatchSize: number
  private readonly workgroupSize: number
  private readonly stepCount: number

  private lastCamPos = new THREE.Vector3(Infinity, Infinity, Infinity)

  constructor(
    count: number,
    positionTex: THREE.DataTexture,
    texWidth: number,
    _texHeight: number,
    _renderer: THREE.WebGPURenderer
  ) {
    this.count = count
    this.paddedCount = nextPowerOfTwo(count)
    this.camPosUniform = new THREE.Uniform(new THREE.Vector3())

    this.dispatchSize = this.paddedCount / 2
    this.workgroupSize = Math.min(this.dispatchSize, 64)

    // Storage buffers
    this.distanceBuffer = instancedArray(this.paddedCount, 'float')
    this.indexBuffer = instancedArray(this.paddedCount, 'uint')
    this.tempDistBuffer = instancedArray(this.paddedCount, 'float')
    this.tempIdxBuffer = instancedArray(this.paddedCount, 'uint')

    // Info storage: [currentAlgo, currentSwapSpan, maxSwapSpan]
    // Updated by GPU compute shaders (setAlgo/reset), read by global flip/disperse shaders
    this.infoStorage = instancedArray(new Uint32Array([1, 2, 2]), 'uint')

    this.stepCount = this._getStepCount()

    // Build all compute shader nodes
    this._buildDistanceCompute(positionTex, texWidth)
    this._buildSwapLocal()
    this._buildFlipGlobal()
    this._buildDisperseGlobal()
    this._buildDisperseLocal()
    this._buildAlign()
    this._buildSetAlgo()
    this._buildReset()

    console.log(`[GpuSort] Initialized: ${count} splats, padded to ${this.paddedCount}, wg=${this.workgroupSize}, steps=${this.stepCount}`)
  }

  private _getStepCount(): number {
    const logElements = Math.log2(this.paddedCount)
    const logSwapSpan = Math.log2(this.workgroupSize * 2)
    const numGlobalFlips = logElements - logSwapSpan

    let numSteps = 1 // initial local swap
    let numGlobalDisperses = 0

    for (let i = 1; i <= numGlobalFlips; i++) {
      numSteps += 1
      numSteps += numGlobalDisperses
      numSteps += 1
      numGlobalDisperses += 1
    }

    return numSteps
  }

  // ---- Distance computation ----

  private _buildDistanceCompute(positionTex: THREE.DataTexture, texWidth: number): void {
    const camPos = uniform(this.camPosUniform)
    const texW = int(texWidth)
    const splatCount = uint(this.count)
    const distBuf = this.distanceBuffer
    const idxBuf = this.indexBuffer

    this.computeDistancesNode = Fn(() => {
      const i = instanceIndex

      idxBuf.element(i).assign(i)

      const u = i.toInt().mod(texW)
      const v = i.toInt().div(texW)
      const posData = textureLoad(positionTex, ivec2(u, v))
      const pos = posData.xyz

      const diff = pos.sub(camPos)
      const dist = diff.dot(diff)

      // Negate so ascending sort = back-to-front (farthest first)
      // Padded elements: set to 0 (smallest in ascending = sorted to front,
      // but they have indices >= count so the vertex shader will cull them)
      const finalDist = select(
        i.greaterThanEqual(splatCount),
        float(0.0),
        dist.negate()
      )

      distBuf.element(i).assign(finalDist)
    })().compute(this.paddedCount, [this.workgroupSize])
  }

  // ---- Local compare-and-swap ----

  private _localCompareAndSwap(
    localDist: ReturnType<typeof workgroupArray>,
    localIdx: ReturnType<typeof workgroupArray>,
    a: any, b: any
  ): void {
    const d1 = localDist.element(a).toVar()
    const d2 = localDist.element(b).toVar()
    const i1 = localIdx.element(a).toVar()
    const i2 = localIdx.element(b).toVar()

    localDist.element(a).assign(min(d1, d2))
    localDist.element(b).assign(max(d1, d2))

    const shouldSwap = d1.greaterThan(d2)
    localIdx.element(a).assign(select(shouldSwap, i2, i1))
    localIdx.element(b).assign(select(shouldSwap, i1, i2))
  }

  // ---- Global compare-and-swap ----

  private _globalCompareAndSwap(
    a: any, b: any,
    rdDist: any, rdIdx: any,
    wrDist: any, wrIdx: any
  ): void {
    const d1 = rdDist.element(a)
    const d2 = rdDist.element(b)
    const i1 = rdIdx.element(a)
    const i2 = rdIdx.element(b)

    wrDist.element(a).assign(min(d1, d2))
    wrDist.element(b).assign(max(d1, d2))

    const shouldSwap = d1.greaterThan(d2)
    wrIdx.element(a).assign(select(shouldSwap, i2, i1))
    wrIdx.element(b).assign(select(shouldSwap, i1, i2))
  }

  // ---- Build compute nodes ----

  private _buildSwapLocal(): void {
    const { distanceBuffer, indexBuffer, workgroupSize } = this
    const localDist = workgroupArray('float', workgroupSize * 2)
    const localIdx = workgroupArray('uint', workgroupSize * 2)

    this.swapLocalNode = Fn(() => {
      const localOffset = uint(workgroupSize).mul(2).mul(workgroupId.x).toVar()
      const lid1 = invocationLocalIndex.mul(2)
      const lid2 = invocationLocalIndex.mul(2).add(1)

      localDist.element(lid1).assign(distanceBuffer.element(localOffset.add(lid1)))
      localDist.element(lid2).assign(distanceBuffer.element(localOffset.add(lid2)))
      localIdx.element(lid1).assign(indexBuffer.element(localOffset.add(lid1)))
      localIdx.element(lid2).assign(indexBuffer.element(localOffset.add(lid2)))

      workgroupBarrier()

      const flipBlockHeight = uint(2)

      Loop({ start: uint(2), end: uint(workgroupSize * 2), type: 'uint', condition: '<=', update: '<<= 1' }, () => {
        workgroupBarrier()

        const flipIdx = getBitonicFlipIndices(invocationLocalIndex, flipBlockHeight)
        this._localCompareAndSwap(localDist, localIdx, flipIdx.x, flipIdx.y)

        const localBlockHeight = flipBlockHeight.div(2)

        Loop({ start: localBlockHeight, end: uint(1), type: 'uint', condition: '>', update: '>>= 1' }, () => {
          workgroupBarrier()
          const disperseIdx = getBitonicDisperseIndices(invocationLocalIndex, localBlockHeight)
          this._localCompareAndSwap(localDist, localIdx, disperseIdx.x, disperseIdx.y)
          localBlockHeight.divAssign(2)
        })

        flipBlockHeight.shiftLeftAssign(1)
      })

      workgroupBarrier()

      distanceBuffer.element(localOffset.add(lid1)).assign(localDist.element(lid1))
      distanceBuffer.element(localOffset.add(lid2)).assign(localDist.element(lid2))
      indexBuffer.element(localOffset.add(lid1)).assign(localIdx.element(lid1))
      indexBuffer.element(localOffset.add(lid2)).assign(localIdx.element(lid2))
    })().compute(this.dispatchSize, [this.workgroupSize])
  }

  private _buildFlipGlobal(): void {
    const currentSwapSpan = this.infoStorage.element(1)

    const flipDataToTemp = Fn(() => {
      const idx = getBitonicFlipIndices(instanceIndex, currentSwapSpan)
      this._globalCompareAndSwap(idx.x, idx.y,
        this.distanceBuffer, this.indexBuffer,
        this.tempDistBuffer, this.tempIdxBuffer)
    })().compute(this.dispatchSize, [this.workgroupSize])

    const flipTempToData = Fn(() => {
      const idx = getBitonicFlipIndices(instanceIndex, currentSwapSpan)
      this._globalCompareAndSwap(idx.x, idx.y,
        this.tempDistBuffer, this.tempIdxBuffer,
        this.distanceBuffer, this.indexBuffer)
    })().compute(this.dispatchSize, [this.workgroupSize])

    this.flipGlobalNodes = { data: flipDataToTemp, temp: flipTempToData }
  }

  private _buildDisperseGlobal(): void {
    const currentSwapSpan = this.infoStorage.element(1)

    const disperseDataToTemp = Fn(() => {
      const idx = getBitonicDisperseIndices(instanceIndex, currentSwapSpan)
      this._globalCompareAndSwap(idx.x, idx.y,
        this.distanceBuffer, this.indexBuffer,
        this.tempDistBuffer, this.tempIdxBuffer)
    })().compute(this.dispatchSize, [this.workgroupSize])

    const disperseTempToData = Fn(() => {
      const idx = getBitonicDisperseIndices(instanceIndex, currentSwapSpan)
      this._globalCompareAndSwap(idx.x, idx.y,
        this.tempDistBuffer, this.tempIdxBuffer,
        this.distanceBuffer, this.indexBuffer)
    })().compute(this.dispatchSize, [this.workgroupSize])

    this.disperseGlobalNodes = { data: disperseDataToTemp, temp: disperseTempToData }
  }

  private _buildDisperseLocal(): void {
    const { workgroupSize } = this
    const localDist = workgroupArray('float', workgroupSize * 2)
    const localIdx = workgroupArray('uint', workgroupSize * 2)

    const buildFor = (rwDist: any, rwIdx: any) => {
      return Fn(() => {
        const localOffset = uint(workgroupSize).mul(2).mul(workgroupId.x).toVar()
        const lid1 = invocationLocalIndex.mul(2)
        const lid2 = invocationLocalIndex.mul(2).add(1)

        localDist.element(lid1).assign(rwDist.element(localOffset.add(lid1)))
        localDist.element(lid2).assign(rwDist.element(localOffset.add(lid2)))
        localIdx.element(lid1).assign(rwIdx.element(localOffset.add(lid1)))
        localIdx.element(lid2).assign(rwIdx.element(localOffset.add(lid2)))

        workgroupBarrier()

        const localBlockHeight = uint(workgroupSize * 2)

        Loop({ start: localBlockHeight, end: uint(1), type: 'uint', condition: '>', update: '>>= 1' }, () => {
          workgroupBarrier()
          const disperseIdx = getBitonicDisperseIndices(invocationLocalIndex, localBlockHeight)
          this._localCompareAndSwap(localDist, localIdx, disperseIdx.x, disperseIdx.y)
          localBlockHeight.divAssign(2)
        })

        workgroupBarrier()

        rwDist.element(localOffset.add(lid1)).assign(localDist.element(lid1))
        rwDist.element(localOffset.add(lid2)).assign(localDist.element(lid2))
        rwIdx.element(localOffset.add(lid1)).assign(localIdx.element(lid1))
        rwIdx.element(localOffset.add(lid2)).assign(localIdx.element(lid2))
      })().compute(this.dispatchSize, [this.workgroupSize])
    }

    this.disperseLocalNodes = {
      data: buildFor(this.distanceBuffer, this.indexBuffer),
      temp: buildFor(this.tempDistBuffer, this.tempIdxBuffer),
    }
  }

  private _buildAlign(): void {
    this.alignNode = Fn(() => {
      this.distanceBuffer.element(instanceIndex).assign(this.tempDistBuffer.element(instanceIndex))
      this.indexBuffer.element(instanceIndex).assign(this.tempIdxBuffer.element(instanceIndex))
    })().compute(this.paddedCount, [this.workgroupSize])
  }

  private _buildSetAlgo(): void {
    const { infoStorage, workgroupSize } = this

    const SWAP_LOCAL = 1
    const DISPERSE_LOCAL = 2
    const FLIP_GLOBAL = 3
    const DISPERSE_GLOBAL = 4

    this.setAlgoNode = Fn(() => {
      const currentAlgo = infoStorage.element(0)
      const currentSwapSpan = infoStorage.element(1)
      const maxSwapSpan = infoStorage.element(2)

      // After SWAP_LOCAL or DISPERSE_LOCAL: start new flip at next higher span
      // After FLIP_GLOBAL or DISPERSE_GLOBAL: halve span, go local if small enough
      const isSwapLocal = currentAlgo.equal(SWAP_LOCAL)
      const isDisperseLocal = currentAlgo.equal(DISPERSE_LOCAL)
      const isStartOfNewBlock = isSwapLocal.or(isDisperseLocal)

      const nextSwapSpan = currentSwapSpan.div(2)

      // New algo determination
      currentAlgo.assign(
        select(
          isStartOfNewBlock,
          uint(FLIP_GLOBAL),
          select(
            nextSwapSpan.lessThanEqual(uint(workgroupSize * 2)),
            uint(DISPERSE_LOCAL),
            uint(DISPERSE_GLOBAL)
          )
        )
      )

      // New swap span
      const newMaxSwapSpan = select(isSwapLocal, uint(workgroupSize * 4), maxSwapSpan.mul(2))
      currentSwapSpan.assign(
        select(isStartOfNewBlock, newMaxSwapSpan, nextSwapSpan)
      )

      // Update max swap span
      maxSwapSpan.assign(
        select(isStartOfNewBlock, newMaxSwapSpan, maxSwapSpan)
      )
    })().compute(1)
  }

  private _buildReset(): void {
    const { infoStorage } = this

    this.resetNode = Fn(() => {
      infoStorage.element(0).assign(1) // SWAP_LOCAL
      infoStorage.element(1).assign(2)
      infoStorage.element(2).assign(2)
    })().compute(1)
  }

  // ---- Sort execution ----

  /**
   * Execute the full sort for this frame.
   * Returns false if the sort was skipped (camera didn't move enough).
   */
  sort(camera: THREE.Camera, renderer: THREE.WebGPURenderer): boolean {
    const camPos = camera.position
    const dx = camPos.x - this.lastCamPos.x
    const dy = camPos.y - this.lastCamPos.y
    const dz = camPos.z - this.lastCamPos.z
    if (dx * dx + dy * dy + dz * dz < 0.01) return false

    this.lastCamPos.copy(camPos)
    this.camPosUniform.value.copy(camPos)

    // 1. Compute distances
    renderer.compute(this.computeDistancesNode)

    // 2. Reset algo state
    renderer.compute(this.resetNode)

    // 3. Full bitonic sort — CPU-driven stepping (same as Three.js BitonicSort.compute())
    let readBufferName: 'Data' | 'Temp' = 'Data'
    let currentDispatch = 0
    let globalOpsRemaining = 0
    let globalOpsInSpan = 0

    for (let step = 0; step < this.stepCount; step++) {
      if (currentDispatch === 0) {
        // Initial full local swap
        renderer.compute(this.swapLocalNode)
        globalOpsRemaining = 1
        globalOpsInSpan = 1
      } else if (globalOpsRemaining > 0) {
        const isFlip = globalOpsRemaining === globalOpsInSpan

        if (isFlip) {
          renderer.compute(readBufferName === 'Data'
            ? this.flipGlobalNodes.data
            : this.flipGlobalNodes.temp)
        } else {
          renderer.compute(readBufferName === 'Data'
            ? this.disperseGlobalNodes.data
            : this.disperseGlobalNodes.temp)
        }

        readBufferName = readBufferName === 'Data' ? 'Temp' : 'Data'
        globalOpsRemaining -= 1
      } else {
        // Local disperse after all global ops for this span
        renderer.compute(readBufferName === 'Data'
          ? this.disperseLocalNodes.data
          : this.disperseLocalNodes.temp)

        const nextSpanGlobalOps = globalOpsInSpan + 1
        globalOpsInSpan = nextSpanGlobalOps
        globalOpsRemaining = nextSpanGlobalOps
      }

      currentDispatch += 1

      if (currentDispatch === this.stepCount) {
        // Sort complete
        if (readBufferName === 'Temp') {
          renderer.compute(this.alignNode)
          readBufferName = 'Data'
        }
        renderer.compute(this.resetNode)
      } else {
        // Advance GPU-side state for the next step
        renderer.compute(this.setAlgoNode)
      }
    }

    return true
  }

  /**
   * Force a sort regardless of movement threshold.
   */
  sortForce(camera: THREE.Camera, renderer: THREE.WebGPURenderer): void {
    this.lastCamPos.set(Infinity, Infinity, Infinity)
    this.sort(camera, renderer)
  }

  dispose(): void {
    // Storage buffers are managed by Three.js garbage collection
  }
}
