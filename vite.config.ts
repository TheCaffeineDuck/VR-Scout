import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor: Three.js ecosystem
          'three-core': ['three'],
          'three-r3f': ['@react-three/fiber', '@react-three/drei'],
          'three-xr': ['@react-three/xr'],
          // Vendor: Firebase
          'firebase': ['firebase/app', 'firebase/firestore', 'firebase/auth'],
          // Vendor: React
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
})
