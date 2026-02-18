import * as THREE from 'three/webgpu'
import { parseSplat } from './formats/parseSplat'
import { parsePly } from './formats/parsePly'
import { SplatData } from './SplatData'
import { createSplatGeometry } from './SplatGeometry'
import { createSplatMaterial } from './SplatMaterial'
import { SplatSorter } from './SplatSorter'

export class SplatMesh extends THREE.Object3D {
  private mesh: THREE.Mesh | null = null
  private data: SplatData | null = null
  private sorter: SplatSorter | null = null
  private positions: Float32Array | null = null

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

  private _build(parsed: ReturnType<typeof parseSplat>): void {
    this.data = new SplatData(parsed)
    const geometry = createSplatGeometry(parsed.count)
    const material = createSplatMaterial(this.data)

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = false // We handle culling in the shader
    this.add(this.mesh)

    this.centerOnBounds(parsed.positions, parsed.count)

    // Keep a reference to positions for the sorter
    this.positions = parsed.positions

    // Set up the depth sorter
    this.sorter = new SplatSorter()
    this.sorter.setCallback((indices: Uint32Array) => {
      this._applySortResult(indices)
    })
    this.sorter.init(parsed.positions, parsed.count)
  }

  private _applySortResult(indices: Uint32Array): void {
    if (!this.mesh) return
    const geo = this.mesh.geometry as THREE.InstancedBufferGeometry
    const attr = geo.getAttribute('sortOrder') as THREE.InstancedBufferAttribute
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

    // Trigger depth sort when camera moves
    if (this.sorter) {
      const pos = camera.position
      this.sorter.sort(pos.x, pos.y, pos.z)
    }
  }

  /** Call once after the scene is set up to trigger the initial sort. */
  triggerInitialSort(camera: THREE.Camera): void {
    if (this.sorter) {
      const pos = camera.position
      this.sorter.sortForce(pos.x, pos.y, pos.z)
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose()
      ;(this.mesh.material as THREE.Material).dispose()
    }
    this.data?.dispose()
    this.sorter?.dispose()
  }

  private centerOnBounds(positions: Float32Array, count: number): void {
    if (count === 0) return

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (let i = 0; i < count; i++) {
      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const z = positions[i * 3 + 2]
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2

    this.position.set(-cx, -cy, -cz)

    console.log(`[SplatMesh] Bounds: (${minX.toFixed(2)}, ${minY.toFixed(2)}, ${minZ.toFixed(2)}) → (${maxX.toFixed(2)}, ${maxY.toFixed(2)}, ${maxZ.toFixed(2)})`)
    console.log(`[SplatMesh] Centered at (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)})`)
  }
}
