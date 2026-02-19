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
  gpuSort: GpuSort | null = null  // public for debugging
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
    // Use GPU sort on native WebGPU backend, CPU sort on WebGL fallback.
    this.useGpuSort = this._isNativeWebGPU(renderer)
    const backend = this.useGpuSort ? 'WebGPU (GPU sort)' : 'WebGL (CPU sort)'
    console.log(`[SplatMesh] Backend: ${backend}`)
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

    // Update viewport uniform with device pixel dimensions (accounts for HiDPI).
    // Use domElement.width/height which are the actual canvas pixel dimensions
    // (already multiplied by devicePixelRatio via renderer.setPixelRatio).
    const material = this.mesh.material as any
    if (material._viewportUniform) {
      if (this.renderer) {
        material._viewportUniform.value.set(
          this.renderer.domElement.width,
          this.renderer.domElement.height
        )
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
    let needsYFlip = false

    if (minSD === sdY) {
      // Y-up — but check if Y is inverted (common in COLMAP/3DGS .splat files).
      // In a properly oriented scene, the lower Y values should have more splats
      // (ground/objects are denser than sky). Compare density in lower vs upper half.
      let lowerCount = 0, upperCount = 0
      for (let i = 0; i < count; i += sampleStep) {
        if (positions[i * 3 + 1] < meanY) lowerCount++
        else upperCount++
      }
      // If more splats are in the upper half (high Y), Y is likely inverted.
      // Ground has more splats than sky, so ground should be at lower Y values.
      // Use a significant margin (60%) to avoid false positives on symmetric scenes.
      if (upperCount > lowerCount * 1.2) {
        needsYFlip = true
        console.log(`[SplatMesh] Orientation: Y-up but INVERTED (lower=${lowerCount}, upper=${upperCount}) — flipping Y`)
      } else {
        console.log(`[SplatMesh] Orientation: Y-up (native Three.js) — no rotation needed (lower=${lowerCount}, upper=${upperCount})`)
      }
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
    } else if (needsYFlip) {
      // Flip Y axis by scaling Y by -1. This is a 180° rotation around X.
      // Rx(π): (x,y,z) → (x, -y, -z)
      // For centroid to land at origin: position = -rotated = (-meanX, meanY, meanZ)
      this.rotation.set(Math.PI, 0, 0)
      this.position.set(-meanX, meanY, meanZ)
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
      // Room/environment: use floor detection + standing height
      // Collect Y values in world space (after any rotation fix)
      const worldYValues = new Float32Array(count)
      if (needsOrientationFix) {
        // After Rx(-π/2): local (x,y,z) → world (x, z, -y) + position
        // world Y = z + position.y = z - meanZ (position.y = -meanZ)
        for (let i = 0; i < count; i++) {
          worldYValues[i] = positions[i * 3 + 2] - meanZ
        }
      } else if (needsYFlip) {
        // After Rx(π): local (x,y,z) → world (x, -y, -z) + position
        // world Y = -y + meanY = meanY - y
        for (let i = 0; i < count; i++) {
          worldYValues[i] = meanY - positions[i * 3 + 1]
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
      // Place camera at floor + 1.6m, but cap at 60% of room height
      const eyeHeight = Math.min(1.6, roomHeight * 0.6)
      const camY = floorY + eyeHeight

      // Place camera back enough to avoid spawning inside foreground objects.
      // Use 0.75x the horizontal SD — more conservative than the previous 0.5x.
      // This helps with scenes like kitchen where foreground objects are dense near center.
      const horizontalSD = Math.max(sdX, sdZ)
      const camZ = horizontalSD * 0.75
      this.cameraSpawn.set(0, camY, camZ)
      this.cameraTarget.set(0, camY, camZ - 1.0) // look forward along -Z

      console.log(`[SplatMesh] Environment mode: floor=${floorY.toFixed(2)}, ceil=${ceilY.toFixed(2)}, height=${roomHeight.toFixed(2)}, eyeY=${camY.toFixed(2)}, camZ=${camZ.toFixed(2)}`)
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
