import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SplatMesh } from './SplatMesh'
import { generateTestSplatBuffer } from './generateTestSplat'

const params = new URLSearchParams(window.location.search)
const showDebug = params.has('debug')
const splitMode = params.has('split')
const forceWebGL = params.has('webgl')

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

async function loadSplat(splat: SplatMesh): Promise<void> {
  const customFile = params.get('file')
  const previewUrl = params.get('preview')
  const highUrl = params.get('high')

  try {
    if (previewUrl && highUrl) {
      await splat.loadProgressive({
        preview: `/splats/${previewUrl}`,
        high: `/splats/${highUrl}`,
      })
      dbg(`[main] LOD: preview=${previewUrl}, high=${highUrl}`)
    } else {
      const fileToLoad = customFile ? `/splats/${customFile}` : '/splats/room.splat'
      await splat.load(fileToLoad)
      dbg(`[main] Loaded ${fileToLoad}`)
    }
  } catch (e: any) {
    dbg('[main] No splat file found, using synthetic: ' + (e?.message || e))
    const syntheticBuffer = generateTestSplatBuffer(1000)
    splat.loadFromBuffer(syntheticBuffer)
    dbg('[main] Synthetic data loaded')
  }
}

async function initNormal() {
  dbg('[main] Starting (normal mode)...')
  document.body.classList.add('normal-mode')

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)
  dbg(`[main] Calling renderer.init() (${forceWebGL ? 'WebGL' : 'WebGPU'})...`)
  await renderer.init()
  dbg(`[main] Renderer initialized (backend: ${forceWebGL ? 'WebGL' : 'WebGPU'})`)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x111111)

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 1.6, 3)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  const splat = new SplatMesh()
  splat.setRenderer(renderer)
  splat.onLoadProgress = (pct: number) => { dbg(`[main] LOD loading: ${pct}%`) }

  await loadSplat(splat)
  scene.add(splat)

  // Expose for debugging
  ;(window as any).__splat = splat
  ;(window as any).__renderer = renderer

  camera.position.copy(splat.cameraSpawn)
  controls.target.copy(splat.cameraTarget)
  controls.update()
  splat.triggerInitialSort(camera)

  let frameCount = 0
  let lastFpsTime = performance.now()
  let fpsFrames = 0

  function animate() {
    requestAnimationFrame(animate)
    controls.update()
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

    // Log FPS every 2 seconds when debug is on
    if (showDebug) {
      const now = performance.now()
      if (now - lastFpsTime >= 2000) {
        const fps = Math.round(fpsFrames * 1000 / (now - lastFpsTime))
        dbg(`[main] FPS: ${fps}`)
        lastFpsTime = now
        fpsFrames = 0
      }
    }
  }
  animate()

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

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
  const dpr = window.devicePixelRatio

  // Create both renderers
  const gpuRenderer = new THREE.WebGPURenderer({ canvas: leftCanvas, antialias: true, forceWebGL: false })
  gpuRenderer.setSize(W, H)
  gpuRenderer.setPixelRatio(dpr)

  const glRenderer = new THREE.WebGPURenderer({ canvas: rightCanvas, antialias: true, forceWebGL: true })
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

  // Each renderer gets its own SplatMesh since materials hold renderer-specific GPU resources
  const gpuScene = new THREE.Scene()
  gpuScene.background = new THREE.Color(0x111111)
  const glScene = new THREE.Scene()
  glScene.background = new THREE.Color(0x111111)

  const gpuSplat = new SplatMesh()
  gpuSplat.setRenderer(gpuRenderer)

  const glSplat = new SplatMesh()
  glSplat.setRenderer(glRenderer)

  // Load the same file into both splat meshes
  await loadSplat(gpuSplat)
  await loadSplat(glSplat)

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

    const t0 = performance.now()
    try { gpuRenderer.render(gpuScene, camera) } catch (e: any) { dbg('GPU RENDER ERROR: ' + e?.message) }
    gpuFrames++

    const t1 = performance.now()
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
