import * as THREE from 'three/webgpu'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface LoadedFileInfo {
  name: string
  sizeBytes: number
  format: string
  splatCount: number
}

/* ------------------------------------------------------------------ */
/*  Loading overlay                                                   */
/* ------------------------------------------------------------------ */

let loadingEl: HTMLDivElement | null = null

export function showLoading(message: string): void {
  if (!loadingEl) {
    loadingEl = document.getElementById('loading-overlay') as HTMLDivElement
  }
  if (loadingEl) {
    loadingEl.querySelector('.loading-text')!.textContent = message
    loadingEl.classList.add('visible')
  }
}

export function hideLoading(): void {
  if (!loadingEl) {
    loadingEl = document.getElementById('loading-overlay') as HTMLDivElement
  }
  loadingEl?.classList.remove('visible')
}

/* ------------------------------------------------------------------ */
/*  Error overlay                                                     */
/* ------------------------------------------------------------------ */

let errorEl: HTMLDivElement | null = null

export function showError(message: string): void {
  if (!errorEl) {
    errorEl = document.getElementById('error-overlay') as HTMLDivElement
  }
  if (errorEl) {
    errorEl.querySelector('.error-text')!.textContent = message
    errorEl.classList.add('visible')
  }
}

export function hideError(): void {
  if (!errorEl) {
    errorEl = document.getElementById('error-overlay') as HTMLDivElement
  }
  errorEl?.classList.remove('visible')
}

/* ------------------------------------------------------------------ */
/*  Drop zone                                                         */
/* ------------------------------------------------------------------ */

export function initDropZone(onFile: (file: File) => void): void {
  const dropOverlay = document.getElementById('drop-overlay')!
  const dropZone = document.getElementById('drop-zone')!

  let dragCounter = 0

  window.addEventListener('dragenter', (e) => {
    e.preventDefault()
    dragCounter++
    dropOverlay.classList.add('visible')
  })

  window.addEventListener('dragleave', (e) => {
    e.preventDefault()
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      dropOverlay.classList.remove('visible')
    }
  })

  window.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  })

  window.addEventListener('drop', (e) => {
    e.preventDefault()
    dragCounter = 0
    dropOverlay.classList.remove('visible')

    const file = e.dataTransfer?.files[0]
    if (!file) return
    onFile(file)
  })

  // Also allow clicking the drop zone to open a file picker
  dropZone.addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.splat,.ply,.spz'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) onFile(file)
    }
    input.click()
  })
}

/* ------------------------------------------------------------------ */
/*  Filename display                                                  */
/* ------------------------------------------------------------------ */

export function showFilename(name: string): void {
  const el = document.getElementById('filename-display')
  if (el) {
    el.textContent = name
    el.classList.add('visible')
  }
}

/* ------------------------------------------------------------------ */
/*  Mode indicator (Orbit / Fly)                                      */
/* ------------------------------------------------------------------ */

export function setModeIndicator(mode: 'Orbit' | 'Fly'): void {
  const el = document.getElementById('mode-indicator')
  if (el) {
    el.textContent = mode === 'Fly' ? 'Fly [F]' : 'Orbit [F]'
  }
}

/* ------------------------------------------------------------------ */
/*  Control panel                                                     */
/* ------------------------------------------------------------------ */

export interface ControlPanelCallbacks {
  onBgColor: (color: string) => void
  onGrid: (show: boolean) => void
  onBudget: (count: number) => void
}

let panelExpanded = true

export function initControlPanel(
  callbacks: ControlPanelCallbacks,
  totalSplats: number,
): void {
  const panel = document.getElementById('control-panel')!
  const body = panel.querySelector('.panel-body') as HTMLDivElement
  const toggle = panel.querySelector('.panel-toggle') as HTMLButtonElement
  const budgetSlider = panel.querySelector('#budget-slider') as HTMLInputElement
  const budgetLabel = panel.querySelector('#budget-label') as HTMLSpanElement

  // Toggle panel
  toggle.addEventListener('click', () => {
    panelExpanded = !panelExpanded
    body.style.display = panelExpanded ? 'block' : 'none'
    toggle.textContent = panelExpanded ? '×' : '☰'
  })

  // Background color buttons
  const bgButtons = panel.querySelectorAll<HTMLButtonElement>('.bg-btn')
  bgButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      bgButtons.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      callbacks.onBgColor(btn.dataset.color!)
    })
  })

  // Grid toggle
  const gridCheck = panel.querySelector('#grid-toggle') as HTMLInputElement
  gridCheck.addEventListener('change', () => {
    callbacks.onGrid(gridCheck.checked)
  })

  // Budget slider
  budgetSlider.max = String(totalSplats)
  budgetSlider.value = String(totalSplats)
  budgetLabel.textContent = formatCount(totalSplats)

  budgetSlider.addEventListener('input', () => {
    const val = parseInt(budgetSlider.value)
    budgetLabel.textContent = formatCount(val)
    callbacks.onBudget(val)
  })
}

export function updateControlPanel(totalSplats: number): void {
  const panel = document.getElementById('control-panel')
  if (!panel) return
  const budgetSlider = panel.querySelector('#budget-slider') as HTMLInputElement | null
  const budgetLabel = panel.querySelector('#budget-label') as HTMLSpanElement | null
  if (budgetSlider && budgetLabel) {
    budgetSlider.max = String(totalSplats)
    budgetSlider.value = String(totalSplats)
    budgetLabel.textContent = formatCount(totalSplats)
  }
}

/* ------------------------------------------------------------------ */
/*  Info readout                                                      */
/* ------------------------------------------------------------------ */

export function updateInfo(info: Partial<LoadedFileInfo> & { fps?: number }): void {
  if (info.splatCount !== undefined) {
    const el = document.getElementById('info-splats')
    if (el) el.textContent = formatCount(info.splatCount) + ' splats'
  }
  if (info.sizeBytes !== undefined) {
    const el = document.getElementById('info-size')
    if (el) el.textContent = formatSize(info.sizeBytes)
  }
  if (info.format !== undefined) {
    const el = document.getElementById('info-format')
    if (el) el.textContent = info.format
  }
  if (info.fps !== undefined) {
    const el = document.getElementById('info-fps')
    if (el) el.textContent = info.fps + ' FPS'
  }
}

/* ------------------------------------------------------------------ */
/*  Copy link button                                                  */
/* ------------------------------------------------------------------ */

export function showCopyLink(): void {
  const el = document.getElementById('copy-link-btn')
  if (el) el.classList.add('visible')
}

export function initCopyLink(): void {
  const btn = document.getElementById('copy-link-btn') as HTMLButtonElement | null
  if (!btn) return
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const orig = btn.textContent
      btn.textContent = 'Copied!'
      setTimeout(() => { btn.textContent = orig }, 1500)
    })
  })
}

/* ------------------------------------------------------------------ */
/*  Drop zone visibility for initial state                            */
/* ------------------------------------------------------------------ */

export function showDropZone(): void {
  const el = document.getElementById('drop-zone')
  if (el) el.classList.add('visible')
}

export function hideDropZone(): void {
  const el = document.getElementById('drop-zone')
  if (el) el.classList.remove('visible')
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB'
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(1) + ' KB'
  return bytes + ' B'
}

export function detectFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'splat' || ext === 'ply' || ext === 'spz') return ext
  return 'unknown'
}

export function isSupportedFormat(filename: string): boolean {
  return ['splat', 'ply', 'spz'].includes(detectFormat(filename))
}
