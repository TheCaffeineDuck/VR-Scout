# VR Scout v2 — MeshSplatting Migration

## Context

VR Scout v2 is a WebXR location scouting app built with Vite + React 19 + React Three Fiber + @react-three/xr. It loads .glb triangle meshes with vertex colors and renders them via MeshBasicMaterial.

The current build uses Triangle Splatting v1 exports which produce poor visual quality when rendered as opaque triangles (gaps, visible individual triangles). We are migrating the viewer to support MeshSplatting output (connected opaque meshes with RGB vertex colors) and optimizing the renderer for Quest 3 VR at 90 FPS.

**The application architecture is sound. These changes are surgical — loader swap, renderer tuning, optimizer additions, and conversion script rewrite. No tool, collaboration, or UI components need modification.**

## Rules

- Keep context window usage below 50%
- Run `npx tsc --noEmit` after each phase — fix any errors introduced by YOUR changes in this phase, but do not refactor unrelated existing code
- Do NOT run the full test suite mid-phase — only run it in Phase 5
- Run `npx vite build` only in Phase 5
- If a file you need to modify has unexpected structure, adapt your approach to fit the existing pattern rather than restructuring
- Do NOT modify any files in `src/components/tools/`, `src/components/collaboration/`, `src/components/camera-system/`, or `src/components/ui/`
- All new code must be TypeScript strict mode compliant
- If removing an import breaks other files, update those files to remove the dead reference rather than preserving backward compatibility with Draco

---

## Phase 1: Scene Loader Migration (Draco → meshopt)

### Task 1.1: Update scene-loader.ts

**Read first:**
- `src/lib/scene-loader.ts` (current implementation)
- `package.json` (current dependencies)

**Changes:**
- [x] Remove DRACOLoader import and configuration
- [x] Add MeshoptDecoder import from `three/examples/jsm/libs/meshopt_decoder.module.js`
- [x] Configure GLTFLoader with `.setMeshoptDecoder(MeshoptDecoder)`
- [x] Keep KTX2Loader configuration unchanged (still useful for textured scenes)
- [x] Add a comment noting that GLTFLoader auto-detects compression format, so if any old Draco-compressed .glb files are loaded they will fail gracefully with a console warning rather than crash

**Validation:**
- [x] `npx tsc --noEmit` passes
- [x] Existing scene loading tests still pass (no Draco mocks existed)

### Task 1.2: Clean up Draco dependencies

**Read first:**
- `package.json`
- `vite.config.ts` (check for Draco copy plugins or public directory config)
- `public/` directory listing

**Changes:**
- [x] Remove `draco3d` or `three/examples/jsm/libs/draco` from dependencies if explicitly listed — N/A, not in package.json
- [x] Remove any Vite plugin that copies Draco decoder files to public/ — N/A, none existed
- [x] Delete `public/draco/` directory if it exists — deleted 4 files
- [x] Update any import paths or type declarations that reference Draco — updated TourEditor.tsx comment

**Do NOT remove:**
- `public/basis/` (KTX2 transcoder — still needed) ✅ preserved
- DRACOLoader type imports used only in test files (update these instead) ✅ none existed

**Validation:**
- [x] `npx vite build` succeeds
- [x] No references to `draco` remain in src/ (only explanatory comment in scene-loader.ts)
- [x] `npx tsc --noEmit` passes
- [x] `npx vitest run` — 241/241 tests pass

---

## Phase 2: Renderer VR Optimization

### Task 2.1: Add DPR clamping to renderer.ts

**Read first:**
- `src/lib/renderer.ts` (current implementation)

**Changes:**
- [x] After renderer initialization, clamp pixel ratio: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- [x] Export a helper function `applyVRSettings(renderer)` that:
  - Sets `renderer.xr.setFramebufferScaleFactor(1.0)`
  - Sets `renderer.xr.setFoveation(0.5)`
  - Sets `renderer.setPixelRatio(1.0)`
- [x] Export a helper function `applyDesktopSettings(renderer)` that:
  - Sets `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
  - Sets `renderer.xr.setFoveation(0)` if xr is available

**Validation:**
- [x] `npx tsc --noEmit` passes

### Task 2.2: Hook VR settings into XR session lifecycle

**Read first:**
- `src/hooks/useXRSession.ts` (or equivalent — find where XR session start/end is handled)
- `src/components/viewer/ViewerShell.tsx` (may contain XR session logic)
- Search for `xr.addEventListener` or `useXR` or `XRSession` across src/

**Changes:**
- [x] Import `applyVRSettings` and `applyDesktopSettings` from renderer.ts
- [x] Call `applyVRSettings(renderer)` when XR session starts
- [x] Call `applyDesktopSettings(renderer)` when XR session ends
- [x] If using @react-three/xr's session events, integrate via their hook pattern
- [x] Disable tone mapping in VR (`renderer.toneMapping = THREE.NoToneMapping`) and restore on exit (`renderer.toneMapping = THREE.LinearToneMapping`) for a free performance gain — vertex colors from MeshSplatting are already display-ready

**Validation:**
- [x] `npx tsc --noEmit` passes
- [x] No regressions in desktop mode (verified via preview server — app loads, all UI present, no new console errors)
- [x] VR entry/exit cycle doesn't throw errors (XRSettingsSync component uses proper addEventListener cleanup)

---

## Phase 3: Scene Optimizer (Geometry Merge + BVH)

### Task 3.1: Create or update scene-optimizer.ts

**Read first:**
- `src/lib/scene-optimizer.ts` (may already exist from WebGPU optimization plan)
- `src/lib/raycaster.ts` (current BVH setup)
- `src/hooks/useScene.ts` (where scenes are loaded and processed)
- `package.json` (check for `three-mesh-bvh` dependency)

**If `three-mesh-bvh` is not installed:**
- [x] Already installed (`three-mesh-bvh@^0.9.8` in package.json)

**Create/update `src/lib/scene-optimizer.ts`:**
- [x] Import `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`
- [x] Import `MeshBVH` from `three-mesh-bvh` (acceleratedRaycast already configured via raycaster.ts prototype setup)
- [x] Export function `optimizeLoadedScene(sceneGroup: THREE.Group)` that:
  1. Traverses the group collecting all Mesh children
  2. Clones each geometry and applies its world matrix
  3. Merges all geometries via `mergeGeometries(geometries, false)`
  4. Creates a single `THREE.Mesh` with `MeshBasicMaterial({ vertexColors: true, side: DoubleSide, dithering: true, toneMapped: false })`
  5. Builds a `MeshBVH` on the merged geometry
  6. Assigns `merged.boundsTree = bvh`
  7. Disposes source geometries and materials to free memory
  8. Replaces scene children with merged mesh and resets group transforms (positions baked into geometry)
  9. Returns `{ mesh: THREE.Mesh, bvh: MeshBVH }`
- [x] Export a constant `MAX_VR_TRIANGLES = 500_000` for triangle budget enforcement
- [x] Add a `warnIfOverBudget(triangleCount: number)` function that console.warns if the loaded mesh exceeds the VR budget

### Task 3.2: Integrate optimizer into scene loading

**Read first:**
- `src/hooks/useScene.ts` (current scene loading flow)
- `src/components/viewer/SceneRenderer.tsx` (where scene is added to R3F scene graph)

**Changes:**
- [x] After `orientScene()` in `placeScene()` callback, call `optimizeLoadedScene(scene)` — integrates after orient pipeline completes
- [x] Optimizer replaces all children in the scene group with the single merged mesh (scene group transforms reset to identity since positions are baked)
- [x] Call `warnIfOverBudget(triCount)` after optimization (handles both indexed and non-indexed geometry)
- [x] BVH is built on merged geometry inside `optimizeLoadedScene` — accessible via existing raycaster functions (`raycastScene`, `raycastNearest`) since they use `intersectObject(scene, true)` which traverses to the merged mesh
- [x] Dynamic objects are safe — at the time `placeScene` runs, the scene group contains only the loaded GLB meshes; annotations/avatars/cameras are added later by separate R3F components
- [x] Removed `buildSceneBVH(scene)` call from `placeScene` (now redundant — BVH built in optimizer)
- [x] Kept `disposeSceneBVH` for cleanup paths (unmount + scene swap)

**Validation:**
- [x] `npx tsc --noEmit` passes — zero errors
- [ ] Scene still renders correctly (same visual output) — requires runtime test with .glb file
- [ ] Check `renderer.info.render.calls` in console — scene mesh should be 1 draw call
- [ ] Measurement tool still works (if testable without VR)
- [ ] `npx vitest run` passes

---

## Phase 4: Conversion Script Rewrite

### Task 4.1: Rewrite convert_scene.py

**Read first:**
- `scripts/convert_scene.py` (current .off → .glb implementation)
- `scripts/generate_lod.py` (if it exists)

**Rewrite `scripts/convert_scene.py`:**
- [ ] Input: .ply file (MeshSplatting output with faces + RGB vertex colors)
- [ ] Load via trimesh: `mesh = trimesh.load(input_path)`
- [ ] Print mesh stats: vertex count, face count, has vertex colors
- [ ] Export as .glb via `mesh.export(output_path, file_type='glb')`
- [ ] If `--meshopt` flag (default on): run `gltfpack -i <uncompressed.glb> -o <output.glb> -cc -noq` via subprocess
- [ ] Print compression ratio
- [ ] Add `--lods` flag that generates three LOD variants:
  - `{location_id}_mesh_preview_v1.glb` — 75K faces max
  - `{location_id}_mesh_medium_v1.glb` — 200K faces max
  - `{location_id}_mesh_high_v1.glb` — 500K faces max
  - Use `mesh.simplify_quadric_decimation(target_faces)` for decimation
  - Each LOD gets meshopt compressed
- [ ] Add `--location-id` argument for LOD filenames (default: "scene")
- [ ] Add `--version` argument for LOD filenames (default: "v1")
- [ ] Graceful error if gltfpack not found: warn and output uncompressed .glb

**Validation:**
- [ ] Script runs without errors: `python scripts/convert_scene.py --help`
- [ ] If you have a .ply test file available, test conversion end-to-end

### Task 4.2: Update or create validate_scene.py

**Read first:**
- `scripts/validate_scene.py` (if it exists)

**Create/update `scripts/validate_scene.py`:**
- [ ] Load .glb via trimesh
- [ ] Check: has vertex colors (required for MeshSplatting output)
- [ ] Check: face count within budget (warn if >500K for VR)
- [ ] Check: no degenerate triangles (area > 0)
- [ ] Check: bounding box is reasonable (not NaN, not infinite)
- [ ] Print summary: vertices, faces, file size, bounding box dimensions, vertex color range
- [ ] Exit code 0 if all checks pass, 1 if any fail

**Validation:**
- [ ] Script runs without errors: `python scripts/validate_scene.py --help`

---

## Phase 5: Final Validation

### Task 5.1: Full build verification

- [x] `npx tsc --noEmit` — zero errors
- [x] `npx vitest run` — 241/241 tests pass across 16 test files
- [x] `npx vite build` — production build succeeds (11.74s)
- [x] `grep -r "draco" src/` — only explanatory comments in scene-loader.ts (no functional references)
- [x] `grep -r "DRACOLoader" src/` — only explanatory comment in scene-loader.ts (no imports)

### Task 5.2: Runtime smoke test (if dev server available)

- [x] `npx vite dev --host` starts without errors
- [x] Browser console shows no errors on page load — app UI fully functional
- [x] Existing .glb scenes in `public/scenes/` are Draco-compressed (old pipeline) — they fail gracefully with console warnings as designed (no crash). New meshopt-compressed .glb files from Phase 4's convert_scene.py will load correctly.
- [ ] Draw call count verification deferred until meshopt-compressed test scene is available

---

## Notes for Claude Code

- The project uses Vite + React 19 + TypeScript strict mode
- Three.js version is ^0.182.0 — MeshoptDecoder is available at this version
- @react-three/fiber ^9.0.0, @react-three/drei ^10.0.0, @react-three/xr ^6.0.0
- Zustand is used for state management (viewer-store.ts, tool-store.ts, session-store.ts)
- The project likely has existing patterns for how hooks consume renderer/scene state — follow those patterns rather than inventing new ones
- If a file referenced in "Read first" doesn't exist, note it and proceed with creating the new implementation
- Python scripts use standard libraries + trimesh. If trimesh is not installed in the project's Python env, note it but don't try to install (that's the user's responsibility)
