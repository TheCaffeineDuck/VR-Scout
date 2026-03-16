import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        standalone: resolve(__dirname, 'src/viewer/standalone.html'),
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/ws': {
        target: 'ws://localhost:8002',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/scenes': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
})
