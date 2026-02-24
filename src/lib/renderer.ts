import * as THREE from 'three'

/**
 * Creates a WebGPU renderer with WebGL fallback.
 * Designed to be passed to R3F Canvas `gl` prop as an async factory.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createRenderer(props: any) {
  const canvas = props.canvas as HTMLCanvasElement

  if (navigator.gpu) {
    try {
      const { WebGPURenderer } = await import('three/webgpu')
      const renderer = new WebGPURenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      })
      await renderer.init()
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.0
      console.log('Using WebGPU renderer')
      return renderer
    } catch (e) {
      console.warn('WebGPU init failed, falling back to WebGL:', e)
    }
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  console.log('Using WebGL renderer')
  return renderer
}
