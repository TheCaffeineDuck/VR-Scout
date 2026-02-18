import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SplatMesh } from './SplatMesh'
import { generateTestSplatBuffer } from './generateTestSplat'

// Debug overlay: show logs on screen
const debugEl = document.createElement('div')
debugEl.style.cssText = 'position:fixed;top:0;left:0;color:#0f0;background:rgba(0,0,0,0.7);font:12px monospace;padding:8px;max-height:50vh;overflow:auto;z-index:9999;pointer-events:none;white-space:pre-wrap;max-width:80vw'
document.body.appendChild(debugEl)
function dbg(msg: string) {
  console.log(msg)
  debugEl.textContent += msg + '\n'
}
window.addEventListener('error', (e) => { dbg('UNCAUGHT: ' + e.message) })
window.addEventListener('unhandledrejection', (e) => { dbg('UNHANDLED: ' + e.reason) })

async function init() {
  dbg('[main] Starting...')
  const params = new URLSearchParams(window.location.search)
  // Use ?webgl query param to force WebGL backend (useful when Chrome WebGPU hangs)
  const forceWebGL = params.has('webgl')
  // Use ?file=filename.ply to load a custom file from /splats/
  const customFile = params.get('file')
  // LOD params: ?preview=file1.splat&high=file2.ply
  const previewUrl = params.get('preview')
  const highUrl = params.get('high')

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

  // LOD progress callback
  splat.onLoadProgress = (pct: number) => {
    dbg(`[main] LOD loading: ${pct}%`)
  }

  // Try to load a real splat file, fall back to synthetic
  try {
    if (previewUrl && highUrl) {
      // Progressive LOD loading
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
  scene.add(splat)

  // Position camera inside the captured volume
  camera.position.copy(splat.cameraSpawn)
  controls.target.copy(splat.cameraTarget)
  controls.update()

  // Trigger an initial depth sort so the scene is correct on first render
  splat.triggerInitialSort(camera)

  let frameCount = 0
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
    if (frameCount === 1) dbg('[main] First frame rendered')
    if (frameCount === 10) dbg('[main] 10 frames rendered OK')
  }
  animate()

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

init().catch((e) => {
  dbg('FATAL: ' + (e?.message || e))
  console.error(e)
})
