import * as THREE from 'three/webgpu'
import { parseSplat } from './formats/parseSplat'
import { parsePly } from './formats/parsePly'
import { parseSpz } from './formats/parseSpz'
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
  gpuSort: GpuSort | null = null  // public for debugging
  private positions: Float32Array | null = null
  private renderer: THREE.WebGPURenderer | null = null
  private useGpuSort: boolean = false

  // Sort throttling — cap at ~20 sorts/sec to avoid GPU/CPU thrashing
  private lastSortTime: number = 0
  private sortIntervalMs: number = 50

  // LOD swap guard — prevents centerOnBounds from re-running (and jumping the camera)
  // when loadProgressive() replaces preview data with high-quality data.
  private _isCentered: boolean = false

  /**
   * Suggested camera spawn position in world space, computed by `centerOnBounds()`
   * after a successful `load()` or `loadProgressive()`.
   *
   * The value depends on the detected scene type:
   * - **Small object** — outside the object at ~1.5× diagonal distance
   * - **Tabletop** — elevated above and in front of the surface
   * - **Environment** — floor level + 1.6 m eye height, pulled back from scene centre
   *
   * Read this after `load()` resolves and pass it to your camera / orbit controls.
   * In R3F use the `onCameraHint` callback on `<TSLSplatRenderer>` instead of reading
   * this property directly.
   */
  cameraSpawn: THREE.Vector3 = new THREE.Vector3(0, 1.6, 0)

  /**
   * Suggested camera look-at target in world space, computed alongside `cameraSpawn`.
   * For environment scenes this points one unit forward along -Z from the spawn point
   * (i.e. looking into the room). For object/tabletop scenes it points at the origin.
   */
  cameraTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0)

  /** Optional callback for LOD load progress (0-100) */
  onLoadProgress: ((percent: number) => void) | null = null

  /**
   * Set the WebGPU renderer reference.
   *
   * **Must be called before `load()`**. The renderer is used to detect whether the
   * backend is native WebGPU (enabling GPU-side radix sort) or WebGL (falling back
   * to CPU sort via a Web Worker). Without it the renderer always falls back to CPU sort.
   *
   * In an R3F app, obtain the renderer via `useThree().gl` and cast it:
   * ```ts
   * splatMesh.setRenderer(gl as unknown as THREE.WebGPURenderer)
   * ```
   */
  setRenderer(renderer: THREE.WebGPURenderer): void {
    this.renderer = renderer
    // Use GPU sort on native WebGPU backend, CPU sort on WebGL fallback.
    this.useGpuSort = this._isNativeWebGPU(renderer)
    const backend = this.useGpuSort ? 'WebGPU (GPU sort)' : 'WebGL (CPU sort)'
    console.log(`[SplatMesh] Backend: ${backend}`)
  }

  /**
   * Load a splat file from a URL and build the GPU resources.
   *
   * Accepted formats:
   * - `.splat` — compact binary format (4 × float per splat, positions + covariance)
   * - `.ply`   — PLY files exported from tools like inria/gaussian-splatting or gsplat
   * - `.spz`   — Niantic SPZ compressed format (~10× smaller than .splat)
   *
   * The format is detected from the file extension. After this resolves, the splat
   * is visible in the scene and `cameraSpawn` / `cameraTarget` are populated with
   * suggested camera placement values.
   *
   * Call `setRenderer()` before `load()` to enable GPU sort on WebGPU backends.
   *
   * @throws if the network request fails (non-2xx status).
   */
  async load(url: string): Promise<void> {
    console.log(`[SplatMesh] Loading ${url}...`)
    this._isCentered = false  // fresh load — re-center scene
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
    const buffer = await response.arrayBuffer()
    console.log(`[SplatMesh] Fetched ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`)

    const ext = url.split('.').pop()?.toLowerCase()
    let parsed: ParsedSplatData
    if (ext === 'spz') {
      parsed = await parseSpz(buffer)
    } else if (ext === 'ply') {
      parsed = parsePly(buffer)
    } else {
      parsed = parseSplat(buffer)
    }

    this._build(parsed)
    console.log(`[SplatMesh] Ready: ${parsed.count} splats`)
    // Enable sort-time debug logging when ?debug is active
    if (new URLSearchParams(window.location.search).has('debug')) {
      ;(window as any).__debugSort = true
    }
  }

  loadFromBuffer(buffer: ArrayBuffer, format: 'splat' | 'ply' = 'splat'): void {
    if (format === 'spz' as string) {
      throw new Error('[SplatMesh] loadFromBuffer does not support SPZ format — use load() instead (SPZ decompression is async)')
    }
    this._isCentered = false  // fresh load — re-center scene
    const parsed = format === 'ply' ? parsePly(buffer) : parseSplat(buffer)
    this._build(parsed)
    console.log(`[SplatMesh] Ready (from buffer): ${parsed.count} splats`)
  }

  /**
   * Load multiple quality levels progressively (LOD).
   *
   * Loads the `preview` URL immediately (fast, lower quality) so the user sees
   * something right away. Then fetches `high` (or `medium` if `high` is omitted)
   * in the background and swaps it in without resetting camera placement.
   *
   * The LOD swap is guarded by `_isCentered` — `centerOnBounds()` only runs once
   * (on the preview load). When the high-quality data swaps in, the camera does not jump.
   *
   * Progress during the background fetch is reported via `onLoadProgress` (0–100).
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
      let parsed: ParsedSplatData
      if (ext === 'spz') {
        parsed = await parseSpz(buffer.buffer)
      } else if (ext === 'ply') {
        parsed = parsePly(buffer.buffer)
      } else {
        parsed = parseSplat(buffer.buffer)
      }

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
    // F4+F6: Load-time pruning — remove low-opacity and oversized splats before GPU upload.
    // Controlled via ?prune=<opacityThreshold> (default 0, disabled) and
    // ?scalecull=<multiplier> (default 0, disabled).
    const pruneParams = new URLSearchParams(window.location.search)
    const opacityThreshold = parseFloat(pruneParams.get('prune') || '0')
    const scaleCullMultiplier = parseFloat(pruneParams.get('scalecull') || '0')

    if (opacityThreshold > 0 || scaleCullMultiplier > 0) {
      parsed = this._pruneData(parsed, opacityThreshold, scaleCullMultiplier)
    }

    this.data = new SplatData(parsed)
    this.positions = parsed.positions

    // Pre-compute scene diagonal for GPU sort normalization
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let i = 0; i < parsed.count; i++) {
      const x = parsed.positions[i * 3], y = parsed.positions[i * 3 + 1], z = parsed.positions[i * 3 + 2]
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
    const extX = maxX - minX, extY = maxY - minY, extZ = maxZ - minZ
    const sceneDiagonal = Math.sqrt(extX * extX + extY * extY + extZ * extZ)
    // maxExtent = longest single axis — a tighter bound than the full diagonal.
    // GPU sort uses this to normalize distances: splats beyond maxExtent get key=0.
    // Using maxExtent instead of diagonal spreads the 2048 depth buckets over a
    // tighter range, giving better sort precision for scenes viewed from inside.
    const maxExtent = Math.max(extX, extY, extZ)

    const useGpu = this.useGpuSort && this.renderer

    if (useGpu) {
      // GPU sort path: create GpuSort, pass index buffer to material
      this.gpuSort = new GpuSort(
        parsed.count,
        this.data.positionTex,
        this.data.width,
        this.data.height,
        this.renderer!,
        maxExtent
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

    // Splat budget — limit rendered splat count via ?budget=N URL parameter.
    // Splats are sorted front-to-back; instanceCount=budget renders the nearest
    // 'budget' splats and skips the farthest ones. With front-to-back blending,
    // foreground splats lock in first, so budget cuts distant background detail.
    // Use ?budget=500000 for a ~2× speedup on dense scenes.
    const budgetParam = new URLSearchParams(window.location.search).get('budget')
    const budget = budgetParam ? Math.min(parseInt(budgetParam), parsed.count) : parsed.count
    if (budget < parsed.count) {
      ;(this.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = budget
      console.log(`[SplatMesh] Splat budget: rendering ${budget} of ${parsed.count} splats`)
    }

    this.add(this.mesh)

    // Skip centering on LOD swap — the mesh position/rotation and camera spawn were
    // already set when the preview loaded. Re-centering would jump the camera since
    // the high-quality bounds are nearly identical to the preview bounds.
    if (!this._isCentered) {
      this.centerOnBounds(parsed.positions, parsed.count)
      this._isCentered = true
    } else {
      console.log('[SplatMesh] LOD swap: skipping centerOnBounds (already centered)')
    }
  }

  private _pruneData(parsed: ParsedSplatData, opacityThreshold: number, scaleCullMultiplier: number): ParsedSplatData {
    // Compute median max-scale for scale outlier detection (F6)
    let scaleThreshold = Infinity
    if (scaleCullMultiplier > 0) {
      const maxScales = new Float32Array(parsed.count)
      for (let i = 0; i < parsed.count; i++) {
        maxScales[i] = Math.max(
          parsed.scales[i * 3],
          parsed.scales[i * 3 + 1],
          parsed.scales[i * 3 + 2]
        )
      }
      // Sort a copy for median
      const sorted = Float32Array.from(maxScales).sort()
      const medianScale = sorted[Math.floor(sorted.length / 2)]
      scaleThreshold = medianScale * scaleCullMultiplier
    }

    // Count surviving splats
    let survivingCount = 0
    for (let i = 0; i < parsed.count; i++) {
      if (opacityThreshold > 0 && parsed.opacities[i] < opacityThreshold) continue
      if (scaleCullMultiplier > 0) {
        const ms = Math.max(
          parsed.scales[i * 3],
          parsed.scales[i * 3 + 1],
          parsed.scales[i * 3 + 2]
        )
        if (ms > scaleThreshold) continue
      }
      survivingCount++
    }

    const prunedCount = parsed.count - survivingCount
    if (prunedCount === 0) return parsed

    const pctPruned = ((prunedCount / parsed.count) * 100).toFixed(1)
    console.log(`[SplatMesh] Pruning ${prunedCount} splats (${pctPruned}%): opacity<${opacityThreshold}, scale>${scaleThreshold.toFixed(4)}`)

    const pruned: ParsedSplatData = {
      count: survivingCount,
      positions: new Float32Array(survivingCount * 3),
      scales: new Float32Array(survivingCount * 3),
      rotations: new Float32Array(survivingCount * 4),
      colors: new Float32Array(survivingCount * 3),
      opacities: new Float32Array(survivingCount),
      sh1: parsed.sh1 ? new Float32Array(survivingCount * 9) : null,
    }

    let w = 0
    for (let i = 0; i < parsed.count; i++) {
      if (opacityThreshold > 0 && parsed.opacities[i] < opacityThreshold) continue
      if (scaleCullMultiplier > 0) {
        const ms = Math.max(
          parsed.scales[i * 3],
          parsed.scales[i * 3 + 1],
          parsed.scales[i * 3 + 2]
        )
        if (ms > scaleThreshold) continue
      }

      pruned.positions[w * 3]     = parsed.positions[i * 3]
      pruned.positions[w * 3 + 1] = parsed.positions[i * 3 + 1]
      pruned.positions[w * 3 + 2] = parsed.positions[i * 3 + 2]
      pruned.scales[w * 3]     = parsed.scales[i * 3]
      pruned.scales[w * 3 + 1] = parsed.scales[i * 3 + 1]
      pruned.scales[w * 3 + 2] = parsed.scales[i * 3 + 2]
      pruned.rotations[w * 4]     = parsed.rotations[i * 4]
      pruned.rotations[w * 4 + 1] = parsed.rotations[i * 4 + 1]
      pruned.rotations[w * 4 + 2] = parsed.rotations[i * 4 + 2]
      pruned.rotations[w * 4 + 3] = parsed.rotations[i * 4 + 3]
      pruned.colors[w * 3]     = parsed.colors[i * 3]
      pruned.colors[w * 3 + 1] = parsed.colors[i * 3 + 1]
      pruned.colors[w * 3 + 2] = parsed.colors[i * 3 + 2]
      pruned.opacities[w] = parsed.opacities[i]

      if (parsed.sh1 && pruned.sh1) {
        for (let c = 0; c < 9; c++) {
          pruned.sh1[w * 9 + c] = parsed.sh1[i * 9 + c]
        }
      }
      w++
    }

    return pruned
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

  /**
   * Update the splat mesh for the current frame.
   *
   * **Must be called every frame** (e.g. inside `useFrame` in R3F, or the `animate`
   * loop in a standalone app). It does two things:
   * 1. Refreshes the viewport uniform so the shader knows the current canvas size
   *    (needed for correct splat screen-space projection, including HiDPI and XR).
   * 2. Triggers a back-to-front depth sort (throttled to ~20 sorts/sec). The sort
   *    runs on the GPU (radix sort compute shader) when the backend is native WebGPU,
   *    or on the CPU via a Web Worker when falling back to WebGL.
   *
   * @param camera — The active Three.js camera (PerspectiveCamera or XR camera).
   */
  update(camera: THREE.Camera): void {
    if (!this.mesh) return

    // Update viewport uniform with device pixel dimensions (accounts for HiDPI).
    // Use domElement.width/height which are the actual canvas pixel dimensions
    // (already multiplied by devicePixelRatio via renderer.setPixelRatio).
    const material = this.mesh.material as any
    if (material._viewportUniform) {
      if (this.renderer) {
        const xr = (this.renderer as any).xr
        if (xr?.isPresenting) {
          const baseLayer = xr.getSession()?.renderState?.baseLayer
          if (baseLayer) {
            material._viewportUniform.value.set(
              baseLayer.framebufferWidth / 2,
              baseLayer.framebufferHeight
            )
          }
        } else {
          material._viewportUniform.value.set(
            this.renderer.domElement.width,
            this.renderer.domElement.height
          )
        }
      } else {
        const dpr = window.devicePixelRatio || 1
        material._viewportUniform.value.set(window.innerWidth * dpr, window.innerHeight * dpr)
      }
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

  /**
   * Dispose all GPU resources held by this splat mesh.
   *
   * Frees: the instanced buffer geometry, the TSL material (all uniforms + textures),
   * the position / covariance / colour `DataTexture`s in `SplatData`, the CPU sort
   * Web Worker, and the GPU radix sort compute pipeline + index buffer.
   *
   * Call this when the component unmounts or when loading a new URL, to avoid
   * GPU memory leaks. After `dispose()` the mesh should not be used again.
   */
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
   * Uses the inverse of the mesh's world matrix to handle both translation
   * and any rotation (e.g., orientation fix for Z-up scenes).
   */
  private _getLocalCameraPos(camera: THREE.Camera): THREE.Vector3 {
    this.updateWorldMatrix(true, false)
    const invWorld = this.matrixWorld.clone().invert()
    return camera.position.clone().applyMatrix4(invWorld)
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

    const extX = maxX - minX
    const extY = maxY - minY
    const extZ = maxZ - minZ
    const diagonal = Math.sqrt(extX * extX + extY * extY + extZ * extZ)

    console.log(`[SplatMesh] Bounds: (${minX.toFixed(2)}, ${minY.toFixed(2)}, ${minZ.toFixed(2)}) → (${maxX.toFixed(2)}, ${maxY.toFixed(2)}, ${maxZ.toFixed(2)})`)
    console.log(`[SplatMesh] Extents: X=${extX.toFixed(2)}, Y=${extY.toFixed(2)}, Z=${extZ.toFixed(2)}, diag=${diagonal.toFixed(2)}`)
    console.log(`[SplatMesh] Centroid: (${meanX.toFixed(2)}, ${meanY.toFixed(2)}, ${meanZ.toFixed(2)})`)

    // Detect coordinate system orientation.
    // Many COLMAP/3DGS captures use a coordinate system where the "up" axis
    // has the smallest spread of positions (since scenes are wider than tall).
    // If Y has the smallest spread, it's Y-up (Three.js native) — no rotation needed.
    // If Z has the smallest spread, it's likely Z-up (COLMAP default) — rotate -90° around X.
    // Heuristic: compute standard deviation along each axis to find the "thinnest" direction.
    let varX = 0, varY = 0, varZ = 0
    const sampleStep = Math.max(1, Math.floor(count / 10000)) // sample for speed
    let sampleCount = 0
    for (let i = 0; i < count; i += sampleStep) {
      const dx = positions[i * 3] - meanX
      const dy = positions[i * 3 + 1] - meanY
      const dz = positions[i * 3 + 2] - meanZ
      varX += dx * dx
      varY += dy * dy
      varZ += dz * dz
      sampleCount++
    }
    varX /= sampleCount
    varY /= sampleCount
    varZ /= sampleCount

    const sdX = Math.sqrt(varX)
    const sdY = Math.sqrt(varY)
    const sdZ = Math.sqrt(varZ)
    console.log(`[SplatMesh] StdDev: X=${sdX.toFixed(3)}, Y=${sdY.toFixed(3)}, Z=${sdZ.toFixed(3)}`)

    // Detect if the scene needs orientation correction.
    // The "up" axis in the capture should have the smallest spread.
    // For Three.js we want Y-up. If Y already has the smallest spread, no fix needed.
    // If another axis has the smallest spread, that axis is "up" in the capture.
    const minSD = Math.min(sdX, sdY, sdZ)
    let needsOrientationFix = false

    if (minSD === sdY) {
      // Y-up (native Three.js) — no automatic flip applied.
      // Automatic Y-flip detection is unreliable: the upper/lower splat density
      // heuristic produces false positives on scenes like bonsai where the subject
      // (tree+table) has more mass below center but the capture is right-side-up.
      // Manual override: use ?rotX=180 in the URL to flip an inverted scene.
      console.log(`[SplatMesh] Orientation: Y-up (native Three.js) — no rotation needed`)
    } else if (minSD === sdZ) {
      // Z has smallest spread → Z is "up" in capture → need to rotate
      console.log(`[SplatMesh] Orientation: Z-up detected — applying -90° X rotation`)
      needsOrientationFix = true
    } else {
      // X has smallest spread — unusual, might be a sideways capture
      console.log(`[SplatMesh] Orientation: X-up detected (unusual) — no auto-fix`)
    }

    // Translate mesh so centroid is at world origin
    this.position.set(-meanX, -meanY, -meanZ)

    if (needsOrientationFix) {
      // Apply rotation to the mesh to fix Z-up → Y-up
      // Rx(-π/2): (x,y,z) → (x, z, -y)
      // For centroid to land at origin: position = -rotatedCentroid = (-meanX, -meanZ, meanY)
      this.rotation.set(-Math.PI / 2, 0, 0)
      this.position.set(-meanX, -meanZ, meanY)
    }

    // Determine scene type.
    // Use the largest StdDev as a proxy for scene radius, and bounding box aspect ratio
    // to distinguish tabletop/object scans from true room-scale environments.
    const maxSD = Math.max(sdX, sdY, sdZ)

    // Aspect ratio: horizontal extent vs vertical extent.
    // Tabletop scenes (bonsai, object-on-table) have wide horizontal spread
    // but limited vertical height → ratio > 2.5.
    // Rooms have more balanced proportions (floor to ceiling is significant).
    const horizontalExtent = Math.max(extX, extZ)
    const verticalExtent = extY
    const hToVRatio = verticalExtent > 0 ? horizontalExtent / verticalExtent : 999

    const isSmallObject = maxSD < 2.0
    // Tabletop: wider than tall AND small enough to be an actual tabletop object.
    // maxSD < 3.5 excludes kitchen/room scenes (maxSD ~5-6) while keeping bonsai (maxSD ~1.5-2.5).
    const isTabletop = !isSmallObject && maxSD < 3.5 && hToVRatio > 2.5

    console.log(`[SplatMesh] Scene type: ${isSmallObject ? 'SMALL OBJECT' : isTabletop ? 'TABLETOP' : 'ENVIRONMENT'} (maxSD=${maxSD.toFixed(2)}, hToV=${hToVRatio.toFixed(2)})`)

    if (isSmallObject) {
      // Small object scan: position camera outside looking at center
      const camDist = diagonal * 1.5
      this.cameraSpawn.set(0, diagonal * 0.3, camDist)
      this.cameraTarget.set(0, 0, 0)
      console.log(`[SplatMesh] Object mode: cam distance=${camDist.toFixed(2)}`)
    } else if (isTabletop) {
      // Tabletop scene: camera above and in front, angled down to see the whole surface.
      // Use the horizontal extent to determine viewing distance,
      // and place camera above the top of the scene.
      const viewDist = horizontalExtent * 0.8
      const aboveHeight = verticalExtent * 0.6 + 0.5  // above top of scene
      this.cameraSpawn.set(0, aboveHeight, viewDist)
      this.cameraTarget.set(0, 0, 0) // look at center
      console.log(`[SplatMesh] Tabletop mode: viewDist=${viewDist.toFixed(2)}, aboveH=${aboveHeight.toFixed(2)}`)
    } else {
      // Room/environment: use density-weighted centroid for camera spawn (F5).
      // The densest region of splats is where the camera spent the most time
      // during capture — almost always the intended viewing area. This places
      // the camera inside the room (e.g. kitchen) instead of outside the cloud.

      // F5: Grid-based density centroid
      const GRID_SIZE = 8
      const totalCells = GRID_SIZE * GRID_SIZE * GRID_SIZE
      const cellCounts = new Uint32Array(totalCells)
      const cellSumX = new Float64Array(totalCells)
      const cellSumY = new Float64Array(totalCells)
      const cellSumZ = new Float64Array(totalCells)

      const rangeX = maxX - minX || 1
      const rangeY = maxY - minY || 1
      const rangeZ = maxZ - minZ || 1

      for (let i = 0; i < count; i++) {
        const x = positions[i * 3]
        const y = positions[i * 3 + 1]
        const z = positions[i * 3 + 2]

        const gx = Math.min(Math.floor(((x - minX) / rangeX) * GRID_SIZE), GRID_SIZE - 1)
        const gy = Math.min(Math.floor(((y - minY) / rangeY) * GRID_SIZE), GRID_SIZE - 1)
        const gz = Math.min(Math.floor(((z - minZ) / rangeZ) * GRID_SIZE), GRID_SIZE - 1)

        const cellIdx = gx + gy * GRID_SIZE + gz * GRID_SIZE * GRID_SIZE
        cellCounts[cellIdx]++
        cellSumX[cellIdx] += x
        cellSumY[cellIdx] += y
        cellSumZ[cellIdx] += z
      }

      // Find densest cell
      let maxCount = 0
      let densestCell = 0
      for (let i = 0; i < totalCells; i++) {
        if (cellCounts[i] > maxCount) {
          maxCount = cellCounts[i]
          densestCell = i
        }
      }

      // Density centroid in local (pre-transform) coordinates
      const denseX = cellSumX[densestCell] / cellCounts[densestCell]
      const denseY = cellSumY[densestCell] / cellCounts[densestCell]
      const denseZ = cellSumZ[densestCell] / cellCounts[densestCell]

      // Transform density centroid to world space (after centering + rotation)
      let spawnX: number, spawnY: number, spawnZ: number
      if (needsOrientationFix) {
        // Rx(-π/2): (x,y,z) → world (x - meanX, z - meanZ, -(y - meanY))
        spawnX = denseX - meanX
        spawnY = denseZ - meanZ
        spawnZ = -(denseY - meanY)
      } else {
        spawnX = denseX - meanX
        spawnY = denseY - meanY
        spawnZ = denseZ - meanZ
      }

      // Collect Y values in world space for floor detection
      const worldYValues = new Float32Array(count)
      if (needsOrientationFix) {
        for (let i = 0; i < count; i++) {
          worldYValues[i] = positions[i * 3 + 2] - meanZ
        }
      } else {
        for (let i = 0; i < count; i++) {
          worldYValues[i] = positions[i * 3 + 1] - meanY
        }
      }
      worldYValues.sort()

      const floorY = worldYValues[Math.floor(count * 0.05)]
      const ceilY = worldYValues[Math.floor(count * 0.95)]
      const roomHeight = ceilY - floorY
      const eyeHeight = Math.min(1.6, roomHeight * 0.6)

      // Use density centroid's XZ, but floor-based Y for eye height
      const camY = floorY + eyeHeight
      this.cameraSpawn.set(spawnX, camY, spawnZ)
      // Look toward the scene centroid (origin) from the spawn point
      this.cameraTarget.set(0, camY, 0)

      console.log(`[SplatMesh] Environment mode (F5 density): densest cell ${densestCell} (${maxCount} splats)`)
      console.log(`[SplatMesh]   density centroid local: (${denseX.toFixed(2)}, ${denseY.toFixed(2)}, ${denseZ.toFixed(2)})`)
      console.log(`[SplatMesh]   spawn world: (${spawnX.toFixed(2)}, ${camY.toFixed(2)}, ${spawnZ.toFixed(2)})`)
      console.log(`[SplatMesh]   floor=${floorY.toFixed(2)}, ceil=${ceilY.toFixed(2)}, height=${roomHeight.toFixed(2)}`)
    }

    // URL parameter overrides for manual testing
    const params = new URLSearchParams(window.location.search)
    const camX = params.get('camX')
    const camY = params.get('camY')
    const camZ = params.get('camZ')
    if (camX !== null) this.cameraSpawn.x = parseFloat(camX)
    if (camY !== null) this.cameraSpawn.y = parseFloat(camY)
    if (camZ !== null) this.cameraSpawn.z = parseFloat(camZ)

    const rotX = params.get('rotX')
    if (rotX !== null) {
      this.rotation.set(parseFloat(rotX) * Math.PI / 180, 0, 0)
    }

    console.log(`[SplatMesh] Camera spawn (world): (${this.cameraSpawn.x.toFixed(2)}, ${this.cameraSpawn.y.toFixed(2)}, ${this.cameraSpawn.z.toFixed(2)})`)
  }
}
