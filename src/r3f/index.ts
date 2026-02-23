/**
 * TSL Splat Renderer — R3F Integration Layer
 *
 * Public exports for use inside React Three Fiber applications.
 *
 * ─── Bundler configuration (REQUIRED) ────────────────────────────────────────
 * The standalone renderer imports Three.js via 'three/webgpu' and 'three/tsl'.
 * R3F and Drei import from 'three'. Without aliasing, the bundler creates two
 * separate Three.js module graphs → "Multiple instances of Three.js" warning
 * and subtle bugs (instanceof checks fail, shared state is duplicated).
 *
 * Add these aliases to the consuming app's vite.config.ts:
 *
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 *
 * export default defineConfig({
 *   resolve: {
 *     alias: {
 *       'three/webgpu': 'three/src/Three.WebGPU.js',
 *       'three/tsl':    'three/src/Three.TSL.js',
 *     },
 *     dedupe: ['three'],
 *   },
 * })
 * ```
 *
 * For webpack / Next.js use the equivalent `resolve.alias` in webpack.config.js
 * or `next.config.js` under `webpack(config) { config.resolve.alias = ... }`.
 * ──────────────────────────────────────────────────────────────────────────────
 */

export { TSLSplatRenderer } from './TSLSplatRenderer'
export { useSplatMesh } from './useSplatMesh'
export type { CameraHint, TSLSplatRendererProps, SplatMeshPublicAPI } from './types'
