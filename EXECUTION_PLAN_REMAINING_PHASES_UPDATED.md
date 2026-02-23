# VR Scout — Execution Plan: Remaining Phases (Updated)

**Date:** February 23, 2026
**Starting Point:** TSL Splat Renderer complete with tests, R3F integration, and SPZ support
**Goal:** Production-ready integration into VR Scout for Quest 3

---

## Project Structure

```
c:\Users\aaron\Desktop\VR Location Scout\
├── EXECUTION_PLAN_REMAINING_PHASES.md      ← Original plan (outdated paths)
├── Custom TSL\                              ← ACTIVE DEVELOPMENT
│   ├── VR_Scout_Project_Bible.md
│   ├── STATE_OF_PROJECT_REPORT.md
│   ├── TSL_AND_VR_SCOUT_REMAINING_WORK_PLAN.md
│   └── tsl-splat-renderer\                  ← MAIN TSL RENDERER APP
│       ├── src\
│       │   ├── formats\                     ← parseSplat, parsePly, parseSpz
│       │   ├── r3f\                         ← TSLSplatRenderer, useSplatMesh
│       │   ├── __tests__\                   ← Vitest tests
│       │   └── *.ts                         ← Core renderer files
│       ├── public\splats\                   ← Sample .splat, .ply, .spz files
│       └── package.json
└── VR Location Scout\                       ← OLDER VERSION (not actively used)
```

**Working Directory for All Phases:**
```
cd "c:\Users\aaron\Desktop\VR Location Scout\Custom TSL\tsl-splat-renderer"
```

---

## Current State Summary

### What's Done
- TSL Gaussian Splat renderer with verified math (antimatter15 reference)
- 11 shader/sort bugs fixed
- GPU radix sort (WebGPU) + CPU radix sort (WebGL fallback)
- Three file format parsers: `.splat`, `.ply`, `.spz`
- SH degree 0 + degree 1 support
- Front-to-back blending, near-plane depth fade
- Vitest test suite (parser + sort tests)
- R3F integration: `TSLSplatRenderer.tsx`, `useSplatMesh.ts`
- Standalone viewer: orbit controls, fly mode (WASD), debug overlay, drag-and-drop
- UI module with loading states, error handling, control panel
- Sample splat files in `public/splats/`
- Documentation: Project Bible, State Report, Work Plan

### What's NOT Done
- Fresh WebGPU FPS baseline measurement
- Visual quality score documentation
- SPZ format integration testing in viewer shell
- Comprehensive test coverage (visual regression tests)
- VR Scout integration (WebXR, Quest 3 deployment)

---

## Phase Sequence

| Phase | Name | Sessions | Blocked By | Deliverable |
|-------|------|----------|------------|-------------|
| 1 | Clean Baseline | 1 | Nothing | Verified FPS numbers, committed state, tagged release |
| 2 | Standalone Viewer Polish | 1-2 | Phase 1 | Production-ready drag-and-drop viewer |
| 3 | Test Coverage | 1 | Phase 1 | Visual regression tests, coverage ≥60% |
| 4 | VR Scout Integration | 2-3 | Phases 2, 3 | Splats rendering in VR Scout on Quest 3 |

---

## Phase 1: Clean Baseline & Commit (1 session)

**Goal:** Verify current state, measure FPS baselines, commit and tag.

### Tasks

**1.1 Environment Setup**
```powershell
cd "c:\Users\aaron\Desktop\VR Location Scout\Custom TSL\tsl-splat-renderer"
npm install
npm run build
npm test
```
- Confirm build passes
- Confirm all tests pass
- Record test count

**1.2 WebGPU FPS Measurement**
```powershell
npm run dev
```
- Open `http://localhost:5173/?file=room.splat`
- Confirm WebGPU backend in console
- Record FPS: 30s idle + 30s orbit
- Repeat for `bonsai.splat` and `kitchen.splat`
- **Do NOT load `garden.splat`** — crashes Chrome GPU

**1.3 Visual Quality Check**
- Navigate camera inside room.splat
- Confirm: solid surfaces, no sorting artifacts, correct colors
- Score using rubric (10 = reference match)

**1.4 Commit and Tag**
```powershell
git add -A
git commit -m "chore: Phase 1 baseline — verified rendering and tests"
git tag v0.9.0-baseline
git push origin main --tags
```

**1.5 Create RENDERING_QUALITY_REPORT.md**
Document FPS numbers, quality scores, and test results in `Custom TSL/tsl-splat-renderer/`.

### Verification
- [ ] Build passes (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] WebGPU FPS recorded for room, bonsai, kitchen
- [ ] Quality score documented
- [ ] Changes committed and tagged

### Do NOT
- Make rendering changes (math is verified)
- Load garden.splat
- Start Phase 2 in this session

---

## Phase 2: Standalone Viewer Polish (1-2 sessions)

**Goal:** Production-ready viewer for demos and stakeholder reviews.

### Tasks

**2.1 Verify Existing UI**
- Drag-and-drop zone working
- File browser button
- Format detection (.splat, .ply, .spz, .ksplat)
- Loading progress bar
- File info display (name, size, splat count)

**2.2 Control Panel Polish**
- Camera mode toggle: orbit / fly (WASD)
- Reset camera button
- Background color picker (dark/light/transparent)
- Debug overlay toggle (FPS, splat count, sort method, backend)
- Grid toggle

**2.3 URL Sharing**
- `?url=https://example.com/scene.splat` loads remote files
- `?file=room.splat` loads from `public/splats/`
- Camera position in URL hash for shareable viewpoints

**2.4 SPZ Integration Testing**
- Load a `.spz` file via drag-and-drop
- Verify decompression and rendering
- Test with Scaniverse export or converted file

### Verification
- [ ] Drag-and-drop works for .splat, .ply, .spz
- [ ] All control panel features functional
- [ ] URL param loading works
- [ ] Build clean, tests pass

### Do NOT
- Change renderer internals (SplatMaterial.ts, SplatMesh.ts)
- Add WebXR features (Phase 4)
- Optimize performance

---

## Phase 3: Test Coverage (1 session)

**Goal:** Regression safety net before VR Scout integration.

### Tasks

**3.1 Expand Parser Tests**
- `.splat`: edge cases (empty file, corrupt header)
- `.ply`: SH1 coefficient verification
- `.spz`: decompression validation

**3.2 Sort Correctness Tests**
- CPU sort: verify back-to-front order
- GPU sort: verify key generation matches CPU
- Edge cases: count=1, all same distance

**3.3 DataTexture Packing Tests**
- Create SplatData from known input
- Verify texture values match input
- Verify dimensions for various counts

**3.4 R3F Integration Tests**
- TSLSplatRenderer mounts without error
- useSplatMesh hook lifecycle
- Camera sync working

**3.5 Coverage Report**
```powershell
npm run test:coverage
```
Target: ≥60% coverage on core modules

### Verification
- [ ] Test count ≥ 50
- [ ] All tests pass
- [ ] Coverage ≥ 60%
- [ ] `npm test` runs in < 10 seconds

### Do NOT
- Change source code (only add test files)
- Add browser/Playwright tests (too complex for this phase)

---

## Phase 4: VR Scout Integration (2-3 sessions)

**Goal:** TSL splat renderer in VR Scout, viewable on Quest 3.

### Prerequisites
- Phase 1: baseline verified
- Phase 2: standalone viewer validated
- Phase 3: tests protect against regression

---

### Session 4A: R3F Wrapper Verification

**4A.1 Verify R3F Components**
- `TSLSplatRenderer.tsx` calls `setRenderer()` correctly
- `useFrame` calls `update(camera)` every frame
- Front-to-back blending handled

**4A.2 Fix XR Viewport Uniform**
- Bug M5: viewport uses `domElement.width/height`
- In XR stereo, each eye gets half framebuffer width
- Fix: detect XR session, use per-eye viewport dimensions

**4A.3 Camera Spawn Integration**
- `SplatMesh.cameraSpawn` → XR camera position
- Desktop: OrbitControls target
- VR: teleport to spawn at 1.6m height

**4A.4 Loading Integration**
- Progress callback → loading overlay
- Error callback → error boundary
- Format detection from URL

### Verification (4A)
- [ ] Splat renders in R3F Canvas
- [ ] Camera spawns correctly
- [ ] Orbit controls work
- [ ] Loading progress shows
- [ ] Build clean, tests pass

---

### Session 4B: WebXR / Quest 3

**4B.1 WebXR Session Entry**
- "Enter VR" button with `@react-three/xr`
- Feature detection: `navigator.xr?.isSessionSupported('immersive-vr')`
- Session options: `optionalFeatures: ['hand-tracking', 'local-floor']`

**4B.2 XR Viewport Fix**
- Apply per-eye viewport from 4A.2
- Update `SplatMesh._viewportUniform` with eye dimensions

**4B.3 XR Controls**
- Teleportation via controller ray + trigger
- Thumbstick smooth locomotion
- Hand tracking: pinch to teleport

**4B.4 Quest 3 Testing**
```powershell
npm run dev  # HTTPS with mkcert
```
- Quest Browser → `https://[PC_IP]:3000`
- Accept cert warning
- Load splat, enter VR
- Test: stereo correct? FPS acceptable? Controls work?

**4B.5 Performance on Quest 3**
- Use `forceWebGL: true` (WebXR requires this)
- Target: 72 FPS minimum
- If needed: reduce splat budget, use LOD

### Verification (4B)
- [ ] VR mode enters on Quest 3
- [ ] Stereoscopic rendering correct
- [ ] Teleportation works
- [ ] FPS ≥ 72 for room.splat
- [ ] No obvious visual artifacts

---

### Session 4C: Polish (if needed)

**4C.1 Performance Optimization**
- Splat budget reduction
- LOD: preview (100K) for VR, medium (500K) for desktop
- Reduce DPR on Quest 3

**4C.2 Multi-Scene Support**
- Scene selector in VR menu
- Swap splats without leaving VR
- Fade transitions

**4C.3 Integration with VR Scout Features**
- First-person controls (WASD desktop, XR controllers VR)
- Environment settings
- Error boundary

---

## Decision Points

### After Phase 1
If FPS significantly below previous baselines, investigate before proceeding.

### After Phase 2
Demo standalone viewer. If quality acceptable, proceed. If not, investigate higher-SH files.

### After Phase 4B
If Quest 3 < 72 FPS:
- Drop to preview LOD (100K splats)
- More aggressive frustum culling
- Pre-sort to avoid per-frame cost
- Evaluate `forceWebGL` bottleneck

---

## What NOT to Do

- Do not rewrite rendering pipeline (math is correct)
- Do not load garden.splat (crashes GPU)
- Do not add collaboration features (Croquet, LiveKit) — Phase 4 of VR Scout Bible
- Do not add measurement/annotation tools — Phase 3 of VR Scout Bible
- Do not change parsers unless bug found
- Do not skip Phase 3 testing before integration

---

## Timeline Estimate

| Phase | Sessions | Calendar Time |
|-------|----------|---------------|
| Phase 1: Clean Baseline | 1 | Day 1 |
| Phase 2: Standalone Viewer | 1-2 | Days 1-2 |
| Phase 3: Test Coverage | 1 | Day 2 |
| Phase 4A: R3F Wrapper | 1 | Day 3 |
| Phase 4B: Quest 3 WebXR | 1-2 | Days 3-4 |
| Phase 4C: Polish | 1 | Day 4-5 |
| **Total** | **6-8 sessions** | **~5 days** |

---

## Quick Reference

**Start any session:**
```powershell
cd "c:\Users\aaron\Desktop\VR Location Scout\Custom TSL\tsl-splat-renderer"
npm install
npm run dev
```

**Run tests:**
```powershell
npm test
```

**Build:**
```powershell
npm run build
```
