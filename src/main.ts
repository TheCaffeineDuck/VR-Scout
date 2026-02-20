import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SplatMesh } from './SplatMesh'
import { parseSpz } from './formats/parseSpz'
import { generateTestSplatBuffer } from './generateTestSplat'
import { FlyControls } from './flyControls'
import {
  showLoading, hideLoading,
  showError, hideError,
  initDropZone, showFilename,
  setModeIndicator,
  initControlPanel, updateControlPanel, updateInfo,
  showCopyLink, initCopyLink,
  showDropZone, hideDropZone,
  detectFormat, isSupportedFormat,
} from './ui'

const params = new URLSearchParams(window.location.search)
const showDebug = params.has('debug')
const splitMode = params.has('split')
const forceWebGL = params.has('webgl')
const dprParam = params.get('dpr')
const dpr = dprParam ? Math.min(parseFloat(dprParam), 2) : window.devicePixelRatio

// Optional debug overlay (enable with ?debug)
let debugEl: HTMLDivElement | null = null
if (showDebug) {
  debugEl = document.createElement('div')
  debugEl.style.cssText = 'position:fixed;top:0;left:0;color:#0f0;background:rgba(0,0,0,0.7);font:12px monospace;padding:8px;max-height:50vh;overflow:auto;z-index:9999;pointer-events:none;white-space:pre-wrap;max-width:80vw'
  document.body.appendChild(debugEl)
}

function dbg(msg: string) {
  console.log(msg)
  if (debugEl) debugEl.textContent += msg + '\n'
}

window.addEventListener('error', (e) => { dbg('UNCAUGHT: ' + e.message) })
window.addEventListener('unhandledrejection', (e) => { dbg('UNHANDLED: ' + e.reason) })

// Error overlay dismiss
document.getElementById('error-overlay')?.addEventListener('click', () => { hideError() })

/* ------------------------------------------------------------------ */
/*  Remote URL loading with progress                                  */
/* ------------------------------------------------------------------ */

async function fetchWithProgress(url: string): Promise<{ buffer: ArrayBuffer; size: number }> {
  const response = await fetch(url)
  if (!response.ok) {
    if (response.status === 404) throw new Error('File not found at the given URL.')
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const contentLength = response.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : 0

  if (!response.body || total === 0) {
    // No streaming — just download at once
    showLoading('Loading...')
    const buffer = await response.arrayBuffer()
    return { buffer, size: buffer.byteLength }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    const pct = Math.round((received / total) * 100)
    showLoading(`Loading... ${pct}%`)
  }

  const buffer = new ArrayBuffer(received)
  const view = new Uint8Array(buffer)
  let offset = 0
  for (const chunk of chunks) {
    view.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { buffer, size: received }
}

/* ------------------------------------------------------------------ */
/*  Load splat from various sources                                   */
/* ------------------------------------------------------------------ */

interface LoadResult {
  name: string
  sizeBytes: number
  format: string
  splatCount: number
}

async function loadSplatFromParams(splat: SplatMesh): Promise<LoadResult | null> {
  const urlParam = params.get('url')
  const customFile = params.get('file')
  const previewUrl = params.get('preview')
  const highUrl = params.get('high')

  try {
    if (urlParam) {
      // Remote URL loading (highest priority)
      const format = detectFormat(urlParam)
      if (format === 'unknown') {
        showError('Unrecognized file format. Supported: .splat, .ply, .spz')
        return null
      }
      showLoading('Connecting...')
      try {
        const { buffer, size } = await fetchWithProgress(urlParam)
        showLoading('Parsing...')
        if (format === 'spz') {
          const parsed = await parseSpz(buffer)
          ;(splat as any)._isCentered = false
          ;(splat as any)._build(parsed)
        } else {
          splat.loadFromBuffer(buffer, format as 'splat' | 'ply')
        }
        hideLoading()
        const count = getSplatCount(splat)
        return { name: urlParam.split('/').pop() || 'remote', sizeBytes: size, format, splatCount: count }
      } catch (e: any) {
        hideLoading()
        const msg = e?.message || String(e)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('TypeError')) {
          showError("This file can't be loaded due to CORS restrictions. The host server needs to allow cross-origin requests.")
        } else if (msg.includes('404') || msg.includes('not found')) {
          showError('File not found at the given URL.')
        } else {
          showError('Network error — check your connection.\n' + msg)
        }
        return null
      }
    } else if (previewUrl && highUrl) {
      showLoading('Loading preview...')
      await splat.loadProgressive({
        preview: `/splats/${previewUrl}`,
        high: `/splats/${highUrl}`,
      })
      hideLoading()
      dbg(`[main] LOD: preview=${previewUrl}, high=${highUrl}`)
      const count = getSplatCount(splat)
      return { name: highUrl, sizeBytes: 0, format: detectFormat(highUrl), splatCount: count }
    } else if (customFile) {
      const fileToLoad = `/splats/${customFile}`
      showLoading('Loading...')
      await splat.load(fileToLoad)
      hideLoading()
      dbg(`[main] Loaded ${fileToLoad}`)
      const count = getSplatCount(splat)
      return { name: customFile, sizeBytes: 0, format: detectFormat(customFile), splatCount: count }
    } else {
      // No file parameter — show drop zone, don't load anything
      return null
    }
  } catch (e: any) {
    hideLoading()
    dbg('[main] Load error: ' + (e?.message || e))
    showError('Failed to load file: ' + (e?.message || e))
    return null
  }
}

async function loadSplatFromFile(
  splat: SplatMesh,
  file: File,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): Promise<LoadResult | null> {
  const format = detectFormat(file.name)
  if (!isSupportedFormat(file.name)) {
    showError('Unrecognized file format. Supported: .splat, .ply, .spz')
    return null
  }

  showLoading('Parsing...')
  try {
    if (format === 'spz') {
      const buffer = await file.arrayBuffer()
      const parsed = await parseSpz(buffer)
      ;(splat as any)._isCentered = false
      ;(splat as any)._build(parsed)
    } else {
      const buffer = await file.arrayBuffer()
      splat.loadFromBuffer(buffer, format as 'splat' | 'ply')
    }
    hideLoading()

    // Position camera
    camera.position.copy(splat.cameraSpawn)
    controls.target.copy(splat.cameraTarget)
    controls.update()
    splat.triggerInitialSort(camera)

    const count = getSplatCount(splat)
    return { name: file.name, sizeBytes: file.size, format, splatCount: count }
  } catch (e: any) {
    hideLoading()
    showError('Failed to parse file: ' + (e?.message || e))
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Splat count helper                                                */
/* ------------------------------------------------------------------ */

function getSplatCount(splat: SplatMesh): number {
  const mesh = (splat as any).mesh as THREE.Mesh | null
  if (!mesh) return 0
  const geo = mesh.geometry as THREE.InstancedBufferGeometry
  return geo.instanceCount ?? 0
}

function getTotalSplatCount(splat: SplatMesh): number {
  const data = (splat as any).data as { count: number } | null
  return data?.count ?? getSplatCount(splat)
}

/* ------------------------------------------------------------------ */
/*  Normal mode (single renderer)                                     */
/* ------------------------------------------------------------------ */

async function initNormal() {
  dbg('[main] Starting (normal mode)...')
  document.body.classList.add('normal-mode')

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL, alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(dpr)
  document.body.appendChild(renderer.domElement)
  dbg(`[main] DPR: ${dpr} (native: ${window.devicePixelRatio}${dprParam ? ', overridden via ?dpr=' + dprParam : ''})`)
  dbg(`[main] Calling renderer.init() (${forceWebGL ? 'WebGL' : 'WebGPU'})...`)
  await renderer.init()
  dbg(`[main] Renderer initialized (backend: ${forceWebGL ? 'WebGL' : 'WebGPU'})`)

  const scene = new THREE.Scene()
  // No scene.background — for front-to-back blending, framebuffer alpha must start at 0.
  // CSS background on the canvas provides the visual background color.
  renderer.domElement.style.background = '#111111'

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 1.6, 3)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  const splat = new SplatMesh()
  splat.setRenderer(renderer)
  splat.onLoadProgress = (pct: number) => { dbg(`[main] LOD loading: ${pct}%`) }

  // Grid helper (hidden by default)
  const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x222222)
  gridHelper.visible = false
  scene.add(gridHelper)

  // Fly controls (disabled until toggled)
  const flyControls = new FlyControls(camera, renderer.domElement)
  flyControls.enabled = false
  let isFlyMode = false

  // Expose for debugging
  ;(window as any).__splat = splat
  ;(window as any).__renderer = renderer

  // Init copy link
  initCopyLink()

  // ── Load from URL params ──
  let loadResult = await loadSplatFromParams(splat)

  if (loadResult) {
    scene.add(splat)
    camera.position.copy(splat.cameraSpawn)
    controls.target.copy(splat.cameraTarget)
    controls.update()
    splat.triggerInitialSort(camera)

    hideDropZone()
    showFilename(loadResult.name)
    updateInfo(loadResult)

    // Show copy link for ?url= loads
    if (params.has('url')) showCopyLink()

    // Init control panel
    const total = getTotalSplatCount(splat)
    document.getElementById('control-panel')?.classList.add('visible')
    initControlPanel({
      onBgColor: (color) => { renderer.domElement.style.background = color },
      onGrid: (show) => { gridHelper.visible = show },
      onBudget: (count) => {
        const mesh = (splat as any).mesh as THREE.Mesh | null
        if (mesh) (mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = count
      },
    }, total)
  } else if (!params.has('url')) {
    // No file to load — show drop zone
    showDropZone()
  }

  // ── Drag-and-drop ──
  initDropZone(async (file: File) => {
    hideDropZone()
    hideError()
    const result = await loadSplatFromFile(splat, file, camera, controls)
    if (result) {
      if (!splat.parent) scene.add(splat)
      loadResult = result
      showFilename(result.name)
      updateInfo(result)
      const total = getTotalSplatCount(splat)
      if (!document.getElementById('control-panel')?.classList.contains('visible')) {
        document.getElementById('control-panel')?.classList.add('visible')
        initControlPanel({
          onBgColor: (color) => { renderer.domElement.style.background = color },
          onGrid: (show) => { gridHelper.visible = show },
          onBudget: (count) => {
            const mesh = (splat as any).mesh as THREE.Mesh | null
            if (mesh) (mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = count
          },
        }, total)
      } else {
        updateControlPanel(total)
      }
    }
  })

  // ── Fly mode toggle ──
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      isFlyMode = !isFlyMode
      if (isFlyMode) {
        controls.enabled = false
        flyControls.enabled = true
        setModeIndicator('Fly')
      } else {
        flyControls.enabled = false
        flyControls.unlock()
        controls.enabled = true
        // Set orbit target 2m in front of camera
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        controls.target.copy(camera.position).addScaledVector(forward, 2)
        controls.update()
        setModeIndicator('Orbit')
      }
    }
  })

  // ── Render loop ──
  let fpsFrames = 0
  let lastFpsTime = performance.now()
  let lastDbgFpsTime = performance.now()
  let frameCount = 0
  let currentFps = 0

  function scheduleFrame() {
    // Use rAF when visible, setTimeout fallback when hidden (Chrome throttles rAF to 0 for hidden tabs)
    if (document.hidden) {
      setTimeout(animate, 16)
    } else {
      requestAnimationFrame(animate)
    }
  }

  function animate() {
    scheduleFrame()

    if (isFlyMode) {
      flyControls.update()
    } else {
      controls.update()
    }

    splat.update(camera)
    try {
      renderer.render(scene, camera)
    } catch (e: any) {
      dbg('RENDER ERROR: ' + (e?.message || e))
    }

    frameCount++
    fpsFrames++
    if (frameCount === 1) dbg('[main] First frame rendered')
    if (frameCount === 10) dbg('[main] 10 frames rendered OK')

    // FPS counter: update UI every 500ms
    const now = performance.now()
    if (now - lastFpsTime >= 500) {
      currentFps = Math.round(fpsFrames * 1000 / (now - lastFpsTime))
      updateInfo({ fps: currentFps })
      lastFpsTime = now
      fpsFrames = 0
    }

    // Debug FPS log every 2 seconds
    if (showDebug && now - lastDbgFpsTime >= 2000) {
      dbg(`[main] FPS: ${currentFps}`)
      lastDbgFpsTime = now
    }
  }
  animate()

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

/* ------------------------------------------------------------------ */
/*  Split mode (WebGPU vs WebGL comparison)                           */
/* ------------------------------------------------------------------ */

async function initSplit() {
  dbg('[main] Starting (split mode: WebGPU left | WebGL right)...')
  document.body.classList.add('split-mode')

  // Build layout
  const leftPane = document.createElement('div')
  leftPane.className = 'split-pane'
  const rightPane = document.createElement('div')
  rightPane.className = 'split-pane'

  const leftCanvas = document.createElement('canvas')
  const rightCanvas = document.createElement('canvas')

  const leftLabel = document.createElement('div')
  leftLabel.className = 'split-label'
  leftLabel.textContent = 'WebGPU (native)'

  const rightLabel = document.createElement('div')
  rightLabel.className = 'split-label'
  rightLabel.textContent = 'WebGL (fallback)'

  const leftFps = document.createElement('div')
  leftFps.className = 'split-fps'
  leftFps.textContent = 'FPS: —'

  const rightFps = document.createElement('div')
  rightFps.className = 'split-fps'
  rightFps.textContent = 'FPS: —'

  const divider = document.createElement('div')
  divider.className = 'split-divider'

  leftPane.appendChild(leftCanvas)
  leftPane.appendChild(leftLabel)
  leftPane.appendChild(leftFps)
  rightPane.appendChild(rightCanvas)
  rightPane.appendChild(rightLabel)
  rightPane.appendChild(rightFps)
  document.body.appendChild(leftPane)
  document.body.appendChild(rightPane)
  document.body.appendChild(divider)

  const W = Math.floor(window.innerWidth / 2)
  const H = window.innerHeight

  // Create both renderers
  const gpuRenderer = new THREE.WebGPURenderer({ canvas: leftCanvas, antialias: true, forceWebGL: false, alpha: true })
  gpuRenderer.setSize(W, H)
  gpuRenderer.setPixelRatio(dpr)

  const glRenderer = new THREE.WebGPURenderer({ canvas: rightCanvas, antialias: true, forceWebGL: true, alpha: true })
  glRenderer.setSize(W, H)
  glRenderer.setPixelRatio(dpr)

  await Promise.all([gpuRenderer.init(), glRenderer.init()])
  dbg('[main] Both renderers initialized')

  // Shared camera + scene
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
  camera.position.set(0, 1.6, 3)
  // Controls attached to the left canvas
  const controls = new OrbitControls(camera, leftCanvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  // Each renderer gets its own SplatMesh since materials hold renderer-specific GPU resources
  const gpuScene = new THREE.Scene()
  // No scene.background — front-to-back blending needs framebuffer alpha=0
  leftCanvas.style.background = '#111111'
  const glScene = new THREE.Scene()
  rightCanvas.style.background = '#111111'

  const gpuSplat = new SplatMesh()
  gpuSplat.setRenderer(gpuRenderer)

  const glSplat = new SplatMesh()
  glSplat.setRenderer(glRenderer)

  // Load the same file into both splat meshes
  const customFile = params.get('file')
  const previewUrl = params.get('preview')
  const highUrl = params.get('high')

  async function loadSplitSplat(splat: SplatMesh): Promise<void> {
    try {
      if (previewUrl && highUrl) {
        await splat.loadProgressive({
          preview: `/splats/${previewUrl}`,
          high: `/splats/${highUrl}`,
        })
      } else {
        const fileToLoad = customFile ? `/splats/${customFile}` : '/splats/room.splat'
        await splat.load(fileToLoad)
      }
    } catch (e: any) {
      dbg('[main] No splat file found, using synthetic: ' + (e?.message || e))
      const syntheticBuffer = generateTestSplatBuffer(1000)
      splat.loadFromBuffer(syntheticBuffer)
    }
  }

  await loadSplitSplat(gpuSplat)
  await loadSplitSplat(glSplat)

  gpuScene.add(gpuSplat)
  glScene.add(glSplat)

  // Expose for debugging
  ;(window as any).__gpuSplat = gpuSplat
  ;(window as any).__glSplat = glSplat
  ;(window as any).__gpuRenderer = gpuRenderer
  ;(window as any).__glRenderer = glRenderer

  camera.position.copy(gpuSplat.cameraSpawn)
  controls.target.copy(gpuSplat.cameraTarget)
  controls.update()

  gpuSplat.triggerInitialSort(camera)
  glSplat.triggerInitialSort(camera)

  // FPS tracking per renderer
  let gpuFrames = 0, glFrames = 0
  let lastFpsTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)
    controls.update()

    gpuSplat.update(camera)
    glSplat.update(camera)

    try { gpuRenderer.render(gpuScene, camera) } catch (e: any) { dbg('GPU RENDER ERROR: ' + e?.message) }
    gpuFrames++

    try { glRenderer.render(glScene, camera) } catch (e: any) { dbg('GL RENDER ERROR: ' + e?.message) }
    glFrames++

    // Update FPS labels every second
    const now = performance.now()
    if (now - lastFpsTime >= 1000) {
      const elapsed = now - lastFpsTime
      leftFps.textContent = `FPS: ${Math.round(gpuFrames * 1000 / elapsed)}`
      rightFps.textContent = `FPS: ${Math.round(glFrames * 1000 / elapsed)}`
      gpuFrames = 0
      glFrames = 0
      lastFpsTime = now
    }
  }
  animate()

  window.addEventListener('resize', () => {
    const newW = Math.floor(window.innerWidth / 2)
    const newH = window.innerHeight
    camera.aspect = newW / newH
    camera.updateProjectionMatrix()
    gpuRenderer.setSize(newW, newH)
    glRenderer.setSize(newW, newH)
  })
}

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */

async function init() {
  if (splitMode) {
    await initSplit()
  } else {
    await initNormal()
  }
}

init().catch((e) => {
  dbg('FATAL: ' + (e?.message || e))
  console.error(e)
})
