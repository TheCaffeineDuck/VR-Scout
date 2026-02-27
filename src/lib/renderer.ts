import * as THREE from 'three'

/**
 * Creates a WebGLRenderer for R3F Canvas `gl` prop.
 * Caches per canvas element to avoid redundant GPU context init on remounts.
 *
 * Rendering philosophy for Spark Gaussian Splatting scenes:
 * - Spark handles splat rendering internally via its own pipeline
 * - antialias is disabled (splats don't benefit from MSAA)
 * - Output color space is sRGB for correct monitor display
 * - LinearToneMapping acts as a neutral pass-through at exposure 1.0
 */
const rendererCache = new WeakMap<HTMLCanvasElement, THREE.WebGLRenderer>()

/** Apply VR-optimized settings when entering an XR session. */
export function applyVRSettings(renderer: THREE.WebGLRenderer) {
  renderer.xr.setFramebufferScaleFactor(1.0)
  renderer.xr.setFoveation(0.5)
  renderer.setPixelRatio(1.0)
  // Spark splats are display-ready — skip tone mapping for free perf
  renderer.toneMapping = THREE.NoToneMapping
}

/** Restore desktop-appropriate settings when leaving an XR session. */
export function applyDesktopSettings(renderer: THREE.WebGLRenderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.LinearToneMapping
  renderer.toneMappingExposure = 1.0
  try {
    renderer.xr.setFoveation(0)
  } catch {
    // xr may not be available on all renderers
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRenderer(props: any) {
  const canvas = props.canvas as HTMLCanvasElement

  const cached = rendererCache.get(canvas)
  if (cached) return cached

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // splats don't benefit from MSAA
    powerPreference: 'high-performance',
  })

  // Neutral tone mapping — Spark handles splat colors internally,
  // non-splat elements (annotation markers, grid, etc.) get a
  // neutral mapping that doesn't crush their colours.
  renderer.toneMapping = THREE.LinearToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  rendererCache.set(canvas, renderer)
  console.log('Using WebGL renderer (Spark)')
  return renderer
}
