import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      'three/webgpu': 'three/src/Three.WebGPU.js',
      'three/tsl': 'three/src/Three.TSL.js',
    }
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' }
  },
  build: {
    target: 'esnext'
  }
})
