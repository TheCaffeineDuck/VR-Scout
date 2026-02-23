/**
 * Public type definitions for the TSL Splat Renderer R3F integration layer.
 *
 * Import these types in your R3F application:
 * ```ts
 * import type { CameraHint, TSLSplatRendererProps, SplatMeshPublicAPI } from 'tsl-splat-renderer/src/r3f'
 * ```
 */

import type * as THREE from 'three'

/**
 * Camera placement hint produced after a splat file finishes loading.
 *
 * The splat renderer analyses the scene bounds and classifies the capture
 * (small object, tabletop, or room-scale environment) to compute a sensible
 * starting viewpoint. The consuming app receives this hint via `onCameraHint`
 * and decides whether to apply it (e.g. set OrbitControls.target) or ignore it
 * entirely (e.g. in XR mode where the headset pose drives the camera).
 */
export interface CameraHint {
  /** Where the camera should look — the scene centroid or a forward look-at point. */
  target: THREE.Vector3
  /** Suggested camera world-space position outside / above the captured volume. */
  position: THREE.Vector3
  /** Up vector — always (0, 1, 0) for Y-up scenes (Three.js native). */
  up: THREE.Vector3
}

/**
 * Minimal public surface of a loaded SplatMesh, passed to `onLoad`.
 *
 * Internal details (GPU textures, sort state, material uniforms) are intentionally
 * omitted. If you need lower-level access use `useSplatMesh()` and work with the
 * SplatMesh instance directly.
 */
export interface SplatMeshPublicAPI {
  /** Number of Gaussian splats in the loaded file. */
  readonly splatCount: number
  /** Axis-aligned bounding box in local space (after centring by centerOnBounds). */
  readonly boundingBox: THREE.Box3
  /** True once `load()` has resolved and GPU resources are ready to render. */
  readonly isLoaded: boolean
}

/**
 * Props for the `<TSLSplatRenderer>` R3F component.
 */
export interface TSLSplatRendererProps {
  /**
   * URL of the splat file to load. Supports `.splat` and `.ply` formats.
   * Changing this prop disposes the previous mesh and loads the new URL.
   */
  url: string

  /** World-space position applied to the SplatMesh Object3D. */
  position?: [number, number, number]

  /**
   * Euler rotation (in radians) applied to the SplatMesh Object3D.
   * Note: `centerOnBounds()` may also apply an orientation correction rotation
   * (e.g. Z-up → Y-up). This prop is applied on top of that.
   */
  rotation?: [number, number, number]

  /**
   * Uniform or per-axis scale applied to the SplatMesh Object3D.
   * Pass a single number for uniform scale or a [x, y, z] tuple.
   */
  scale?: [number, number, number] | number

  /**
   * Called once the splat file has loaded and GPU resources are ready.
   * Receives a minimal public API object — not the raw SplatMesh instance.
   * Use `useSplatMesh()` if you need the raw instance.
   */
  onLoad?: (mesh: SplatMeshPublicAPI) => void

  /**
   * Called during the high-quality background fetch in progressive/LOD mode
   * with a value from 0 to 100 representing download progress.
   */
  onProgress?: (percent: number) => void

  /**
   * Called if the fetch or parse step throws. The R3F scene is NOT unmounted —
   * the bad splat is simply skipped and the error is surfaced here.
   */
  onError?: (error: Error) => void

  /**
   * Called after `load()` resolves with a camera placement suggestion derived
   * from scene bounds analysis. The parent app decides what to do with it:
   * - Set `OrbitControls.target` and `camera.position` for desktop viewers
   * - Ignore it in XR mode (headset pose drives the camera)
   * - Tween to it for smooth transitions
   */
  onCameraHint?: (hint: CameraHint) => void
}
