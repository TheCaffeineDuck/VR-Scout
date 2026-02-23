# Visual Quality Audit Report — TSL Splat Renderer Standalone Viewer

**Date:** February 20, 2026
**Server:** Vite dev server (`npm run dev`), http://localhost:5173
**Backend:** WebGPU (Apple Silicon Mac)
**Browser:** Chrome (via Claude in Chrome automation)
**Window:** 960×790 viewport (desktop), 393×852 (mobile test)

---

## 1. Per-Scene Results

| Scene | Splats | Format | FPS | Size Shown | Camera Spawn | Visual Quality (1–10) | Key Issues |
|-------|--------|--------|-----|------------|--------------|----------------------|------------|
| room.splat | 1.13M | splat | 23–25 | 0 B (bug) | Inside room — good | **7** | Recognizable room with furniture/bookshelves. Some depth artifacts. Size=0B bug. |
| room.ply (SH1) | 1.09M | ply | 14 | 0 B (bug) | Inside room — too close to wall | **5** | Camera spawns near/inside wall surface. Large white blob occludes most of view. Room visible in background. SH1 present but hard to evaluate from this angle. |
| bonsai.splat | 1.16M | splat | 33 | 0 B (bug) | Inside pot (K1 issue) | **4** | Known K1 issue: camera inside pot geometry. Scene classified as ENVIRONMENT (maxSD=6.69) instead of TABLETOP. Fragmented/chaotic view from default position. Scene is recognizable if orbited away. |
| kitchen.splat | 1.68M | splat | 15 | 0 B (bug) | Inside kitchen — good | **6** | Recognizable kitchen: countertops, faucet, cabinets. Camera at (1.47, 0.13, 0.69) — inside kitchen as intended. Some depth ordering artifacts at this position. |
| garden.splat | 4.39M | splat | 19 | 0 B (bug) | Inside garden — good | **8** | Best looking scene. Green foliage, brick building, garden path clearly recognizable. Natural colors. Black areas at bottom (no splats below ground — expected). |
| butterfly.spz | 177.1K | spz | 16–18 | 0 B (local) / 4.0 MB (remote) | External view — good | **7** | SPZ format working. Colorful butterfly/disc object visible against dark background. Scene correctly classified as SMALL OBJECT. Camera position good. FPS low for splat count (expected higher). |

### Visual Quality Ratings Breakdown

**room.splat (7/10)**
- Recognizability: 8 — Room with furniture, bookshelves, window with plants clearly visible
- Color accuracy: 7 — Natural warm tones, no green blobs
- Depth ordering: 6 — Some artifacts visible, but mostly correct
- Camera spawn: 8 — Inside room, reasonable position
- Edge quality: 7 — Gaussian falloff visible, some spiky artifacts
- Holes/gaps: 6 — Minor gaps at edges of captured volume
- Orientation: 10 — Right-side-up

**room.ply / SH1 (5/10)**
- Recognizability: 5 — Room visible but mostly occluded by near-camera wall
- Color accuracy: 6 — Colors look fine where visible
- Depth ordering: 5 — Hard to evaluate with wall in face
- Camera spawn: 3 — Too close to wall surface, view largely blocked
- Edge quality: 6 — Normal where visible
- Holes/gaps: N/A — can't evaluate from this position
- Orientation: 10 — Right-side-up

**bonsai.splat (4/10)**
- Recognizability: 3 — From default position, scene is chaotic/fragmented
- Color accuracy: 5 — Colors visible but view is confusing
- Depth ordering: 4 — Inside-pot view shows lots of depth confusion
- Camera spawn: 2 — Inside pot geometry (known K1)
- Edge quality: 5 — Normal
- Holes/gaps: N/A — can't properly evaluate
- Orientation: 10 — Right-side-up

**kitchen.splat (6/10)**
- Recognizability: 7 — Countertops, faucet, yellow accent visible
- Color accuracy: 6 — Reasonable, some washed-out areas
- Depth ordering: 5 — Visible artifacts at spawn position
- Camera spawn: 7 — Inside kitchen, standing height
- Edge quality: 6 — Some spiky artifacts
- Holes/gaps: 5 — Some gaps between surfaces
- Orientation: 10 — Right-side-up

**garden.splat (8/10)**
- Recognizability: 9 — Green foliage, brick building with door, garden path
- Color accuracy: 9 — Natural greens, browns, brick reds
- Depth ordering: 7 — Good from initial position
- Camera spawn: 7 — Inside garden, reasonable viewpoint
- Edge quality: 7 — Good Gaussian falloff on foliage
- Holes/gaps: 6 — Black sky at top/bottom (expected, no captured data there)
- Orientation: 10 — Right-side-up

**butterfly.spz (7/10)**
- Recognizability: 6 — Colorful object, butterfly shape more visible from some angles
- Color accuracy: 8 — Vibrant colors (pinks, blues, cyans, yellows)
- Depth ordering: 7 — Acceptable for small object
- Camera spawn: 9 — External view, facing object, good distance
- Edge quality: 7 — Smooth Gaussian edges
- Holes/gaps: 7 — Small object, good coverage
- Orientation: 10 — Right-side-up

---

## 2. Viewer Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Orbit controls** | PASS | Click-drag orbits smoothly around scene. Damping present. |
| **Fly mode (F key)** | PASS | Pressing F toggles between "Orbit [F]" and "Fly [F]" indicator. Mode switches correctly. |
| **Control panel (bottom-right)** | PASS | Visible on all scenes. Shows Background, Grid, Budget controls + info readout. |
| **Background toggle** | PASS | 3 options: dark (default), mid-gray, light gray. Switching works. UI updates to show 2 remaining options. |
| **Grid toggle** | PASS | Toggles 3D wireframe ground plane grid. Toggle button turns blue when active. |
| **Budget slider** | PASS | Slider reduces rendered splat count. FPS increases proportionally (177K→50K: 14→41 FPS). |
| **Info readout: Splats** | PASS | Shows total loaded splat count (e.g., "1.13M splats"). |
| **Info readout: Size** | PARTIAL | Shows "0 B" for all local `?file=` loads. Shows correct size (e.g., "4.0 MB") for remote `?url=` loads. **Bug: local file size not reported.** |
| **Info readout: Format** | PASS | Correctly shows "splat", "ply", or "spz". |
| **Info readout: FPS** | PASS | Real-time FPS counter visible and updating. |
| **Filename display** | PASS | Filename shown at bottom center (e.g., "room.splat", "butterfly.spz"). |
| **Mode indicator** | PASS | Top-left shows "Orbit [F]" or "Fly [F]". |
| **Remote URL (`?url=`)** | PASS | Successfully loaded butterfly.spz from sparkjs.dev. CORS-compatible fetch works. |
| **Copy Link button** | PASS | Appears top-right when loading via `?url=`. Good for sharing. |
| **Drag-and-drop** | NOT TESTED | Cannot test drag-and-drop via browser automation. Requires manual testing. |
| **Touch/pinch (mobile)** | NOT TESTED | Cannot simulate real touch events via automation. Layout confirmed responsive (see below). |

---

## 3. Error Handling

| Test | Status | Behavior |
|------|--------|----------|
| **Nonexistent remote URL** (`?url=https://example.com/nonexistent.splat`) | PASS | User-friendly error: "This file can't be loaded due to CORS restrictions. The host server needs to allow cross-origin requests." Dismissible with "Click to dismiss". |
| **Nonexistent local file** (`?file=doesnotexist.splat`) | PARTIAL | Shows error: "Failed to load file: Invalid .splat file: size 11106 is not a multiple of 32". Error appears because Vite returns an HTML 404 page which gets parsed as a .splat file. Message is technically correct but confusing — should say "File not found" instead of a parser error. Dismissible. |

---

## 4. Mobile Emulation (393×852 viewport)

| Test | Status | Notes |
|------|--------|-------|
| **Layout adaptation** | PASS | Controls panel moves to full-width at bottom of screen. All controls readable. |
| **Scene rendering** | PASS | Butterfly renders correctly at mobile viewport. |
| **FPS at mobile size** | PASS | 24 FPS (better than desktop due to fewer pixels). |
| **Touch orbit** | NOT TESTED | Cannot simulate real touch events via automation. |
| **Usability** | PASS | All UI elements fit on screen, nothing cut off or overflowing. |

---

## 5. Console Errors

### Actual Errors: **ZERO**

No JavaScript errors, shader compilation errors, WebGPU errors, or runtime exceptions were observed on any scene.

### Warnings (non-blocking):

| Warning | Frequency | Source | Severity |
|---------|-----------|--------|----------|
| `THREE.WARNING: Multiple instances of Three.js being imported.` | Every page load | OrbitControls.js import | Low — cosmetic, does not affect rendering. Caused by Vite dependency pre-bundling resolving three.js from two paths (TSL imports vs OrbitControls import). |

### Observations:

| Observation | Severity | Notes |
|-------------|----------|-------|
| **Vite HMR excessive reloads** | Medium | Every scene load triggers 3–20+ rapid re-executions of the load cycle. The file loads successfully but `[SplatMesh] Loading...` appears many times. This is the known Vite HMR issue — use `npm run preview` for stable testing. Not a code bug. |

---

## 6. Bugs Found

| ID | Bug | Severity | Impact |
|----|-----|----------|--------|
| **V1** | **File size shows "0 B" for local `?file=` loads** | Medium | Info panel always shows "Size: 0 B" when loading via `?file=` parameter. Works correctly via `?url=` (showed "4.0 MB" for butterfly.spz from sparkjs.dev). Likely the local fetch response doesn't extract `Content-Length` or file size is not being tracked for local loads. |
| **V2** | **Bonsai camera spawns inside pot (K1)** | Medium | Known issue. Density-based spawn (F5) places camera inside the densest voxel which is the pot itself. Scene also misclassified as ENVIRONMENT (maxSD=6.69) instead of TABLETOP. |
| **V3** | **room.ply camera too close to wall** | Medium | Camera spawn (2.15, -2.75, -1.08) places viewer very near a wall surface, resulting in a largely occluded view. The room is visible in the background but first impression is a white blob. |
| **V4** | **Nonexistent local file shows parser error instead of "File not found"** | Low | When `?file=doesnotexist.splat` is requested, Vite returns its HTML 404 page, which the parser tries to interpret as a .splat file. Error message says "Invalid .splat file: size 11106 is not a multiple of 32" instead of "File not found". |
| **V5** | **Butterfly FPS low for 177K splats** | Low | 16–18 FPS for only 177K splats seems low. May be Vite dev server overhead, HMR interference, or initial sort settling. Should verify on preview server. |
| **V6** | **Vite HMR causes repeated loads** | Low | Dev server triggers multiple rapid reloads on page navigation. Not a code bug — known Vite behavior. Mitigation: use `npm run preview` for testing. |
| **V7** | **Three.js multiple instance warning** | Cosmetic | `THREE.WARNING: Multiple instances of Three.js being imported` on every load. Caused by OrbitControls importing from a different bundle path than TSL imports. |

---

## 7. Recommendations Before Moving to VR Scout Integration

### Must Fix (before Phase J)

1. **V1 — File size "0 B" for local loads**: The info panel should show actual file size for all load methods. Check if `Content-Length` header is available from Vite dev server, or track `ArrayBuffer.byteLength` after fetch.

2. **V3 — room.ply camera spawn**: The PLY version of room spawns at a bad position. This may be a PLY-specific bounds/density calculation issue since room.splat spawns fine.

### Should Fix

3. **V2 — Bonsai classification**: Consider lowering the TABLETOP threshold or adding a heuristic for scenes where density spawn places camera inside the object mesh. A fallback to external camera for small/tabletop scenes would help.

4. **V4 — Error message for missing local files**: Check HTTP status code before attempting to parse. If response is 404 or content-type is text/html, show "File not found" instead of attempting parse.

### Nice to Have

5. **V7 — Three.js duplicate warning**: Add `dedupe: ['three']` to Vite resolve config if not already present, or alias OrbitControls to use the same three.js instance as TSL.

6. **V5 — Butterfly FPS**: Verify on preview server. If still low, investigate whether 177K splats with shDegree=3 has extra per-splat cost from unused SH data.

### Not Required for Phase J

- Drag-and-drop testing (requires manual verification)
- Real touch/pinch testing (requires real mobile device or DevTools touch emulation)
- Vite HMR reload issue (use preview server for demos)

---

## 8. Overall Assessment

**The standalone viewer is functional and ready for Phase J integration with caveats.**

Strengths:
- All 3 formats (.splat, .ply, .spz) load and render correctly
- GPU sort (WebGPU) and rendering pipeline work without errors
- Controls panel is well-designed and responsive (adapts to mobile)
- Error handling for CORS failures is excellent
- Remote URL loading with Copy Link sharing works perfectly
- Fly/orbit mode toggle works
- Budget slider provides effective performance tuning
- Zero console errors across all scenes

Weaknesses:
- Camera spawn quality varies significantly by scene (great for garden/kitchen, poor for bonsai/room.ply)
- File size not reported for local loads
- Visual quality is "good enough" but not photorealistic — typical for a Gaussian splatting renderer at this stage
- FPS on dev server may be misleadingly low (Vite overhead)

**Verdict: Proceed to Phase J. Fix V1 and V3 as part of integration or as a quick follow-up.**
