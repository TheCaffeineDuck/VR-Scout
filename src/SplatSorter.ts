export class SplatSorter {
  private worker: Worker
  private sortPending: boolean = false
  private lastCamPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
  private onSorted: ((indices: Uint32Array) => void) | null = null

  constructor() {
    this.worker = new Worker(
      new URL('./splat-sort.worker.ts', import.meta.url),
      { type: 'module' }
    )
    this.worker.onmessage = (e: MessageEvent) => {
      this.sortPending = false
      if (this.onSorted) {
        this.onSorted(e.data.indices as Uint32Array)
      }
    }
  }

  init(positions: Float32Array, count: number): void {
    // Transfer a copy — we still need the original in the main thread
    const copy = new Float32Array(positions)
    this.worker.postMessage(
      { type: 'init', positions: copy, count },
      [copy.buffer]
    )
  }

  sort(camX: number, camY: number, camZ: number): void {
    // Skip if a sort is already in flight
    if (this.sortPending) return

    // Skip if camera hasn't moved enough (0.1m threshold = 0.01 squared)
    const dx = camX - this.lastCamPos.x
    const dy = camY - this.lastCamPos.y
    const dz = camZ - this.lastCamPos.z
    if (dx * dx + dy * dy + dz * dz < 0.01) return

    this.lastCamPos = { x: camX, y: camY, z: camZ }
    this.sortPending = true
    this.worker.postMessage({ type: 'sort', camX, camY, camZ })
  }

  /** Force a sort regardless of movement threshold. Call once after init. */
  sortForce(camX: number, camY: number, camZ: number): void {
    if (this.sortPending) return
    this.lastCamPos = { x: camX, y: camY, z: camZ }
    this.sortPending = true
    this.worker.postMessage({ type: 'sort', camX, camY, camZ })
  }

  setCallback(cb: (indices: Uint32Array) => void): void {
    this.onSorted = cb
  }

  dispose(): void {
    this.worker.terminate()
  }
}
