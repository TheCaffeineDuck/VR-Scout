import * as THREE from 'three/webgpu'
import { parseSplat } from './formats/parseSplat'
import { parsePly } from './formats/parsePly'
import type { ParsedSplatData } from './formats/parseSplat'
import { SplatData } from './SplatData'
import { createSplatGeometry } from './SplatGeometry'
import { createSplatMaterial } from './SplatMaterial'
import { SplatSorter } from './SplatSorter'
import { GpuSort } from './GpuSort'

export class SplatMesh extends THREE.Object3D {
  private mesh: THREE.Mesh | null = null
  private data: SplatData | null = null
  private sorter: SplatSorter | null = null
  private gpuSort: GpuSort | null = null
  private positions: Float32Array | null = null
  private renderer: THREE.WebGPURenderer | null = null
  private useGpuSort: boolean = false

  // Sort throttling — cap at ~20 sorts/sec to avoid GPU/CPU thrashing
  private lastSortTime: number = 0
  private sortIntervalMs: number = 50

  /** Suggested camera spawn position (world space, inside the captured volume) */
  cameraSpawn: THREE.Vector3 = new THREE.Vector3(0, 1.6, 0)
  /** Suggested camera look-at target (world space) */
  cameraTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0)

  /** Optional callback for LOD load progress (0-100) */
  onLoadProgress: ((percent: number) => void) | null = null

  /**
   * Set the renderer reference. Must be called before load() for GPU sort detection.
   */
  setRenderer(renderer: THREE.WebGPURenderer): void {
    this.renderer = renderer
    this.useGpuSort = this._isNativeWebGPU(renderer)
    console.log(`[SplatMesh] Backend: ${this.useGpuSort ? 'WebGPU (GPU sort)' : 'WebGL (CPU sort)'}`)
  }

  async load(url: string): Promise<void> {
    console.log(`[SplatMesh] Loading ${url}...`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
    const buffer = await response.arrayBuffer()
    console.log(`[SplatMesh] Fetched ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`)

    const ext = url.split('.').pop()?.toLowerCase()
    const parsed = ext === 'ply' ? parsePly(buffer) : parseSplat(buffer)

    this._build(parsed)
    console.log(`[SplatMesh] Ready: ${parsed.count} splats`)
  }

  loadFromBuffer(buffer: ArrayBuffer, format: 'splat' | 'ply' = 'splat'): void {
    const parsed = format === 'ply' ? parsePly(buffer) : parseSplat(buffer)
    this._build(parsed)
    console.log(`[SplatMesh] Ready (from buffer): ${parsed.count} splats`)
  }

  /**
   * Load multiple quality levels progressively.
   * Loads preview immediately, then upgrades to high quality in background.
   */
  async loadProgressive(urls: { preview: string; medium?: string; high?: string }): Promise<void> {
    // 1. Load preview immediately
    await this.load(urls.preview)

    // 2. Start loading the high-quality version in background
    const highUrl = urls.high || urls.medium
    if (!highUrl) return

    this._loadInBackground(highUrl)
  }

  private async _loadInBackground(url: string): Promise<void> {
    try {
      console.log(`[SplatMesh] LOD: loading high quality from ${url}...`)

      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)

      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength) : 0

      const reader = response.body!.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length
        if (total > 0) {
          const pct = Math.round((loaded / total) * 100)
          this.onLoadProgress?.(pct)
        }
      }

      // Combine chunks into ArrayBuffer
      const buffer = new Uint8Array(loaded)
      let offset = 0
      for (const chunk of chunks) {
        buffer.set(chunk, offset)
        offset += chunk.length
      }

      const ext = url.split('.').pop()?.toLowerCase()
      const parsed = ext === 'ply' ? parsePly(buffer.buffer) : parseSplat(buffer.buffer)

      console.log(`[SplatMesh] LOD: parsed ${parsed.count} splats, swapping...`)
      requestAnimationFrame(() => {
        this._swapData(parsed)
      })
    } catch (e) {
      console.warn('[SplatMesh] LOD upgrade failed, keeping current quality:', e)
    }
  }

  private _swapData(parsed: ParsedSplatData): void {
    const oldData = this.data
    const oldMesh = this.mesh
    const oldSorter = this.sorter
    const oldGpuSort = this.gpuSort

    if (oldMesh) this.remove(oldMesh)

    this._build(parsed)

    // Dispose old resources
    oldData?.dispose()
    oldMesh?.geometry.dispose()
    if (oldMesh?.material) {
      ;(oldMesh.material as THREE.Material).dispose()
    }
    oldSorter?.dispose()
    oldGpuSort?.dispose()

    console.log(`[SplatMesh] LOD upgrade complete: ${parsed.count} splats`)
  }

  private _build(parsed: ParsedSplatData): void {
    this.data = new SplatData(parsed)
    this.positions = parsed.positions

    const useGpu = this.useGpuSort && this.renderer

    if (useGpu) {
      // GPU sort path: create GpuSort, pass index buffer to material
      this.gpuSort = new GpuSort(
        parsed.count,
        this.data.positionTex,
        this.data.width,
        this.data.height,
        this.renderer!
      )
      this.sorter = null

      const geometry = createSplatGeometry(parsed.count)
      const material = createSplatMaterial(this.data, {
        gpuIndexBuffer: this.gpuSort.indexBuffer,
      })

      this.mesh = new THREE.Mesh(geometry, material)
    } else {
      // CPU sort path: existing Web Worker sort
      this.gpuSort = null

      const geometry = createSplatGeometry(parsed.count)
      const material = createSplatMaterial(this.data, { gpuIndexBuffer: null })

      this.mesh = new THREE.Mesh(geometry, material)

      this.sorter = new SplatSorter()
      this.sorter.setCallback((indices: Uint32Array) => {
        this._applySortResult(indices)
      })
      this.sorter.init(parsed.positions, parsed.count)
    }

    this.mesh.frustumCulled = false // We handle culling in the shader
    this.add(this.mesh)

    this.centerOnBounds(parsed.positions, parsed.count)
  }

  private _applySortResult(indices: Uint32Array): void {
    if (!this.mesh) return
    const geo = this.mesh.geometry as THREE.InstancedBufferGeometry
    const attr = geo.getAttribute('sortOrder') as THREE.InstancedBufferAttribute
    if (!attr) return
    const arr = attr.array as Float32Array
    for (let i = 0; i < indices.length; i++) {
      arr[i] = indices[i]
    }
    attr.needsUpdate = true
  }

  update(camera: THREE.Camera): void {
    if (!this.mesh) return

    // Update viewport uniform if window resized
    const material = this.mesh.material as any
    if (material._viewportUniform) {
      material._viewportUniform.value.set(window.innerWidth, window.innerHeight)
    }

    // Throttle sort to max ~20/sec — avoids GPU/CPU thrashing during fast orbits
    const now = performance.now()
    if (now - this.lastSortTime < this.sortIntervalMs) return
    this.lastSortTime = now

    // Transform camera position from world space → local (model) space
    // so sort distances match the local-space splat positions stored in textures/arrays
    const localCam = this._getLocalCameraPos(camera)

    // Trigger sort
    if (this.gpuSort && this.renderer) {
      // GPU sort — all work done on GPU, no CPU upload needed
      this.gpuSort.sort(localCam, this.renderer)
    } else if (this.sorter) {
      // CPU sort fallback
      this.sorter.sort(localCam.x, localCam.y, localCam.z)
    }
  }

  /** Call once after the scene is set up to trigger the initial sort. */
  triggerInitialSort(camera: THREE.Camera): void {
    const localCam = this._getLocalCameraPos(camera)
    if (this.gpuSort && this.renderer) {
      this.gpuSort.sortForce(localCam, this.renderer)
    } else if (this.sorter) {
      this.sorter.sortForce(localCam.x, localCam.y, localCam.z)
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose()
      ;(this.mesh.material as THREE.Material).dispose()
    }
    this.data?.dispose()
    this.sorter?.dispose()
    this.gpuSort?.dispose()
  }

  /**
   * Transform camera position from world space to the local (model) space of
   * this SplatMesh. Required because splat positions stored in textures/arrays
   * are in local space, while camera.position is in world space.
   *
   * Since SplatMesh only applies a translation (from centerOnBounds), the
   * inverse is simply subtracting that translation: localCam = worldCam - meshPos.
   */
  private _getLocalCameraPos(camera: THREE.Camera): THREE.Vector3 {
    return camera.position.clone().sub(this.position)
  }

  private _isNativeWebGPU(renderer: THREE.WebGPURenderer): boolean {
    // Check if the renderer is using the native WebGPU backend (not WebGL fallback)
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false

    // Check the renderer's backend — Three.js exposes this
    const backend = (renderer as any).backend
    if (backend && backend.isWebGLBackend) return false

    return true
  }

  private centerOnBounds(positions: Float32Array, count: number): void {
    if (count === 0) return

    // Compute mean position (centroid) and bounds
    let sumX = 0, sumY = 0, sumZ = 0
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (let i = 0; i < count; i++) {
      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const z = positions[i * 3 + 2]
      sumX += x; sumY += y; sumZ += z
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }

    const meanX = sumX / count
    const meanY = sumY / count
    const meanZ = sumZ / count

    // Translate mesh so centroid is at world origin
    this.position.set(-meanX, -meanY, -meanZ)

    // Camera spawn: at the centroid (world origin after translation).
    // Use a robust floor estimate by taking the 5th percentile of Y values
    // to avoid outlier splats far below the actual floor.
    const yValues = new Float32Array(count)
    for (let i = 0; i < count; i++) yValues[i] = positions[i * 3 + 1]
    yValues.sort()
    const floorY5pct = yValues[Math.floor(count * 0.05)] - meanY
    this.cameraSpawn.set(0, floorY5pct + 1.6, 0)
    this.cameraTarget.set(0, floorY5pct + 1.6, -0.1) // look forward along -Z

    console.log(`[SplatMesh] Bounds: (${minX.toFixed(2)}, ${minY.toFixed(2)}, ${minZ.toFixed(2)}) → (${maxX.toFixed(2)}, ${maxY.toFixed(2)}, ${maxZ.toFixed(2)})`)
    console.log(`[SplatMesh] Centroid: (${meanX.toFixed(2)}, ${meanY.toFixed(2)}, ${meanZ.toFixed(2)})`)
    console.log(`[SplatMesh] Floor (5th pct Y): ${(floorY5pct + meanY).toFixed(2)} → world Y=${floorY5pct.toFixed(2)}`)
    console.log(`[SplatMesh] Camera spawn (world): (${this.cameraSpawn.x.toFixed(2)}, ${this.cameraSpawn.y.toFixed(2)}, ${this.cameraSpawn.z.toFixed(2)})`)
  }
}
