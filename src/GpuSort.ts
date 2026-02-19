import * as THREE from 'three/webgpu'
import {
  Fn, instanceIndex, float, uint, int,
  instancedArray, uniform, textureLoad, ivec2,
  select,
} from 'three/tsl'
import { BitonicSort } from 'three/examples/jsm/gpgpu/BitonicSort.js'

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/**
 * GPU compute sort for Gaussian splats.
 *
 * Uses a packed uint32 key encoding:
 *   bits [31..21] = 11-bit distance quantization (0 = farthest → sorts first ascending)
 *   bits [20..0]  = 21-bit splat index (supports up to 2,097,152 splats)
 *
 * Ascending sort on the packed uint gives back-to-front ordering.
 * The vertex shader extracts the lower 21 bits as the splat index.
 *
 * Only works with native WebGPU backend.
 */
export class GpuSort {
  /**
   * Sorted packed buffer — vertex shader reads lower 21 bits as the splat index.
   * Layout: bits[31:21] = distance key (ascending = farthest first)
   *         bits[20:0]  = original splat index
   */
  readonly indexBuffer: ReturnType<typeof instancedArray>

  private bitonicSort: InstanceType<typeof BitonicSort>
  private computeDistancesNode: any

  private readonly count: number
  private readonly paddedCount: number

  // TSL UniformNode references — update via .value each sort call.
  // Per TSL docs: uniform(initialValue, 'type') → node with .value property.
  private readonly camPosNode: any   // vec3 uniform
  private readonly maxDistSqNode: any  // float uniform

  private lastCamPos = new THREE.Vector3(Infinity, Infinity, Infinity)
  private readonly sceneDiagonal: number

  constructor(
    count: number,
    positionTex: THREE.DataTexture,
    texWidth: number,
    _texHeight: number,
    renderer: THREE.WebGPURenderer,
    sceneDiagonal: number = 100
  ) {
    this.count = count
    this.paddedCount = nextPowerOfTwo(count)
    this.sceneDiagonal = sceneDiagonal

    // Create TSL uniform nodes with explicit type strings (required in Three.js 0.182.0).
    // Initial values don't matter — they get overwritten in sort() before first dispatch.
    this.camPosNode = uniform(new THREE.Vector3(), 'vec3')
    this.maxDistSqNode = uniform(sceneDiagonal * sceneDiagonal, 'float')

    // Single uint32 buffer: packed (distance_key << 21) | splat_index
    // BitonicSort will sort this ascending → farthest splat first
    this.indexBuffer = instancedArray(this.paddedCount, 'uint')

    // Use the reference Three.js BitonicSort on the packed buffer
    this.bitonicSort = new BitonicSort(renderer, this.indexBuffer)

    const workgroupSize = Math.min(this.paddedCount / 2, 64)
    this._buildDistanceCompute(positionTex, texWidth, workgroupSize)

    console.log(`[GpuSort] Initialized: ${count} splats, padded to ${this.paddedCount}, steps=${(this.bitonicSort as any).stepCount}, sceneDiag=${sceneDiagonal.toFixed(1)}`)
  }

  private _buildDistanceCompute(positionTex: THREE.DataTexture, texWidth: number, workgroupSize: number): void {
    const camPos = this.camPosNode
    const maxDistSq = this.maxDistSqNode
    const texW = int(texWidth)
    const splatCount = uint(this.count)
    const packedBuf = this.indexBuffer

    this.computeDistancesNode = Fn(() => {
      const i = instanceIndex

      // Padded elements sort to the very end (0xFFFFFFFF = largest uint)
      const isPadded = i.greaterThanEqual(splatCount)

      const u = i.toInt().mod(texW)
      const v = i.toInt().div(texW)
      const posData = textureLoad(positionTex, ivec2(u, v))
      const pos = posData.xyz

      const diff = pos.sub(camPos)
      const distSq = diff.dot(diff)

      // Quantize distance to 11-bit key: 0 = farthest, 2047 = nearest
      // normalized = 1.0 - clamp(distSq / maxDistSq, 0, 1)
      const normalized = float(1.0).sub(distSq.div(maxDistSq).clamp(float(0), float(1)))
      const distKey = normalized.mul(float(2047.0)).round().toUint()

      // Pack: distKey in bits[31:21], splat index in bits[20:0]
      const packed = distKey.shiftLeft(uint(21)).bitOr(i.toUint().bitAnd(uint(0x1FFFFF)))

      packedBuf.element(i).assign(select(isPadded, uint(0xFFFFFFFF), packed))
    })().compute(this.paddedCount, [workgroupSize])
  }

  /**
   * Execute the full sort for this frame.
   * @param camPos Camera position in **local** (model) space.
   * Returns false if the sort was skipped (camera didn't move enough).
   */
  sort(camPos: THREE.Vector3, renderer: THREE.WebGPURenderer): boolean {
    const dx = camPos.x - this.lastCamPos.x
    const dy = camPos.y - this.lastCamPos.y
    const dz = camPos.z - this.lastCamPos.z
    if (dx * dx + dy * dy + dz * dz < 0.01) return false

    this.lastCamPos.copy(camPos)

    // Update uniform values via .value assignment (TSL pattern).
    // For vec3: .value is the THREE.Vector3 stored in the node — mutate it in-place.
    this.camPosNode.value.copy(camPos)

    // maxDistSq stays fixed at (maxExtent)^2 — the scene extent doesn't change.
    // No per-frame update needed here.

    // 1. Pack distances + indices into single uint32 buffer
    renderer.compute(this.computeDistancesNode)

    // 2. Sort ascending — farthest (lowest key) first
    this.bitonicSort.compute(renderer)

    return true
  }

  /**
   * Force a sort regardless of movement threshold.
   */
  sortForce(camPos: THREE.Vector3, renderer: THREE.WebGPURenderer): void {
    this.lastCamPos.set(Infinity, Infinity, Infinity)
    this.sort(camPos, renderer)
  }

  dispose(): void {
    // Storage buffers managed by Three.js GC
  }
}
