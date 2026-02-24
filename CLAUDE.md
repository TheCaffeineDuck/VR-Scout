# CLAUDE.md — VR Scout v2 Project Brain

## Orchestration Rules

You are the project lead for **VR Scout v2**, a WebXR virtual location scouting application built on Triangle Splatting. You will work through the implementation roadmap below, task by task, phase by phase.

### Context Window Management

**CRITICAL: Keep context usage under 50% at all times.**

- Only read files that are directly relevant to the current task.
- Do NOT read the entire codebase before starting work. Read only what you need.
- When spawning subagents/workers, give them only the files and context for their specific task.
- After completing a task, do NOT carry forward all files. Start the next task fresh.
- If you need to understand existing code, read only the specific file(s) involved.
- Prefer small, focused commits over large sweeping changes.

### How to Work

1. **One task at a time.** Complete it fully before moving to the next.
2. **Read the task description** from the task list below. It tells you exactly what to build.
3. **Read only the files you need** for that task. Typically 1–5 files.
4. **Build the thing.** Write code, create files, install dependencies as needed.
5. **Validate.** Run `tsc --noEmit` and `npx vite build` after each task. Run tests if they exist.
6. **Git commit.** Commit after each completed task with message format: `feat(phase-N/task-N): short description`
7. **Check exit criteria.** If all criteria for a phase are met, move to the next phase.
8. **If blocked**, note the blocker in a `BLOCKERS.md` file and move to the next unblocked task.

### What NOT to Do

- Do NOT build a custom rendering pipeline. Standard Three.js mesh rendering only.
- Do NOT add Gaussian Splat support (.splat/.ply). Triangle meshes only.
- Do NOT add real-time training. The web app is view-only.
- Do NOT add mesh editing in browser.
- Do NOT add multi-scene compositing. One scene at a time.
- Do NOT add custom physics.
- Do NOT over-engineer. Build the simplest thing that works, then iterate.
- Do NOT install packages without checking they are compatible with the specified versions.

### Dependency Version Constraints

Always use these versions. Check package.json before installing anything new.

```
react: ^19.0.0
three: ^0.182.0
@react-three/fiber: ^9.0.0
@react-three/drei: ^10.0.0
@react-three/xr: ^6.0.0
typescript: ^5.9.0
tailwindcss: ^4.0.0
vite: latest
zustand: latest
```

### Project File Structure

All new code goes into this structure. Create directories as needed.

```
vr-scout-v2/
├── public/
│   ├── scenes/              # Local test .glb files
│   ├── hdri/                # Environment maps
│   ├── draco/               # Draco decoder WASM
│   └── basis/               # KTX2 transcoder WASM
├── src/
│   ├── main.tsx             # App entry point
│   ├── App.tsx              # Router, auth context
│   ├── components/
│   │   ├── viewer/          # SceneRenderer, ViewerShell, SceneSelector, EnvironmentSettings, LoadingOverlay, ErrorBoundary
│   │   ├── controls/        # FirstPersonControls, VRControls, TeleportController, VRMenu
│   │   ├── tools/           # MeasurementTool, AnnotationTool, AnnotationMarker, ScreenshotTool, SunPathSimulator, FloorPlanOverlay, LaserPointer
│   │   ├── camera-system/   # VirtualCameraObject, FloatingMonitor, LensRadialMenu, CameraManager, CameraSpawnMenu
│   │   ├── collaboration/   # SessionManager, ParticipantAvatars, ParticipantList, VoiceChatControls, SharedCursor
│   │   ├── comparison/      # ComparisonViewer
│   │   └── ui/              # Toolbar, SettingsPanel, HUD
│   ├── hooks/               # useScene, useXRSession, useMeasurement, useAnnotations, useVirtualCamera, useCollaboration, useVoiceChat, useSunPath
│   ├── lib/                 # renderer, scene-loader, raycaster, screenshot, formats
│   ├── stores/              # viewer-store, tool-store, session-store (Zustand)
│   └── types/               # scene, annotation, camera, session, tools
├── scripts/
│   ├── convert_scene.py     # .off → .glb with Draco compression
│   ├── generate_lod.py      # Triangle decimation for LOD variants
│   └── validate_scene.py    # QC checks on exported meshes
├── tests/
│   ├── unit/                # Vitest unit tests
│   ├── e2e/                 # Playwright E2E tests
│   └── benchmarks/          # FPS benchmarking suite
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## Project Overview

**VR Scout v2** is a WebXR application for virtual location scouting, built for the film/TV production industry. Users capture real-world locations with a camera, reconstruct them as 3D triangle meshes using Triangle Splatting, and explore them in VR with professional measurement, annotation, and virtual camera tools. Multi-user collaboration with spatial voice chat is supported.

**Client:** Aaron Ramos / Origin Point Media
**Primary VR target:** Meta Quest 3 at 90 FPS
**Tech foundation:** Triangle Splatting produces standard triangle meshes from COLMAP SfM data, rendering at 2,400+ FPS on desktop — enabling VR that was impossible with Gaussian Splatting.

---

## Tech Stack Reference

### Core Application
- **Framework:** Vite + React 19 (standalone prototype, Next.js integration later)
- **3D Engine:** Three.js ^0.182.0
- **React 3D:** React Three Fiber ^9.0.0
- **3D Utilities:** @react-three/drei ^10.0.0
- **WebXR:** @react-three/xr ^6.0.0
- **Rendering:** WebGPURenderer (native, no forceWebGL)
- **Type Safety:** TypeScript ^5.9.0, strict mode
- **Styling:** Tailwind CSS ^4.0.0
- **State Management:** Zustand
- **Scene Format:** glTF/GLB 2.0
- **Mesh Compression:** Draco (via Three.js)
- **Texture Compression:** KTX2 / Basis Universal (via Three.js)

### Collaboration & Backend
- **State Sync:** Croquet.io (deterministic multi-user state)
- **Voice Chat:** LiveKit (spatial audio)
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication
- **Payments:** Stripe
- **Storage:** Cloudflare R2 ($0 egress)
- **Email:** Resend

### Testing & DevOps
- **Unit Tests:** Vitest
- **E2E Tests:** Playwright
- **Local HTTPS:** mkcert (for Quest 3 WebXR testing)
- **CI/CD:** GitHub Actions

---

## Performance Targets

| Metric | Target |
|---|---|
| Frame rate (VR) | 90 fps minimum, 72 fps acceptable |
| Frame rate (Desktop) | 60 fps minimum |
| Draw calls (VR) | Under 50 |
| Scene load time (high quality) | < 5 seconds |
| Scene load time (preview LOD) | < 1 second |
| Error rate | < 1% |

---

## Type Definitions

Create these types early and reference them throughout. Each type file should be small and focused.

### src/types/scene.ts
```typescript
export interface SceneLOD {
  preview: string   // URL for preview LOD .glb (50K-100K triangles)
  medium: string    // URL for medium LOD .glb (200K-500K triangles)
  high: string      // URL for high quality .glb (1M-5M triangles)
}

export interface Viewpoint {
  id: string
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  thumbnailUrl: string
}

export interface FloorPlan {
  imageUrl: string
  northOffset: number        // degrees
  bounds: { min: [number, number], max: [number, number] }
}

export interface QCChecklist {
  noArtifacts: boolean
  fullCoverage: boolean
  accurateLighting: boolean
  calibratedScale: boolean
  fileSizeOk: boolean
  lodGenerated: boolean
  viewpointsMarked: boolean
  annotationsAdded: boolean
}

export interface VirtualTour {
  id: string
  locationId: string
  tourType: 'triangle_mesh' | 'panorama'
  meshUrls: SceneLOD
  triangleCount: number
  fileSize: number
  bounds: { min: [number, number, number], max: [number, number, number] }
  spawnPoint: { position: [number, number, number], rotation: [number, number, number] }
  viewpoints: Viewpoint[]
  floorPlan: FloorPlan | null
  qcChecklist: QCChecklist
  gps: { lat: number, lng: number }
  status: 'draft' | 'published'
  createdAt: Date
  updatedAt: Date
}
```

### src/types/annotation.ts
```typescript
export type AnnotationType = 'power' | 'parking' | 'sound' | 'light' | 'access' | 'ceiling' | 'restriction' | 'custom'

export interface AnnotationConfig {
  type: AnnotationType
  icon: string
  label: string
  color: string
}

export const ANNOTATION_TYPES: Record<AnnotationType, AnnotationConfig> = {
  power:       { type: 'power',       icon: '⚡', label: 'Electrical Panel/Outlet', color: '#FBBF24' },
  parking:     { type: 'parking',     icon: 'P',  label: 'Vehicle Access/Parking',  color: '#3B82F6' },
  sound:       { type: 'sound',       icon: '🔇', label: 'Sound Issue (AC, traffic)', color: '#EF4444' },
  light:       { type: 'light',       icon: '☀',  label: 'Natural Light Source',    color: '#F59E0B' },
  access:      { type: 'access',      icon: '🚪', label: 'Load-in/Access Point',    color: '#10B981' },
  ceiling:     { type: 'ceiling',     icon: '🔍', label: 'Ceiling Height',          color: '#8B5CF6' },
  restriction: { type: 'restriction', icon: '⚠',  label: 'Restriction/Limitation',  color: '#F97316' },
  custom:      { type: 'custom',      icon: '📝', label: 'Custom Note',             color: '#6B7280' },
}

export interface Annotation {
  id: string
  locationId: string
  virtualTourId: string
  sessionId: string | null
  position: [number, number, number]
  normal: [number, number, number]
  type: AnnotationType
  title: { en: string, th: string }
  description: { en: string, th: string }
  measurement?: {
    start: [number, number, number]
    end: [number, number, number]
    distance: number   // meters
  }
  visibility: 'private' | 'team' | 'public'
  createdBy: string
  createdAt: Date
}
```

### src/types/camera.ts
```typescript
export interface CinemaLens {
  focalLength: number  // mm
  fov: number          // degrees
  name: string
}

export const CINEMA_LENSES: CinemaLens[] = [
  { focalLength: 18,  fov: 90, name: '18mm Ultra Wide' },
  { focalLength: 24,  fov: 73, name: '24mm Wide' },
  { focalLength: 35,  fov: 54, name: '35mm Standard' },
  { focalLength: 50,  fov: 39, name: '50mm Normal' },
  { focalLength: 85,  fov: 24, name: '85mm Portrait' },
  { focalLength: 135, fov: 15, name: '135mm Telephoto' },
]

export interface VirtualCamera {
  id: string
  position: [number, number, number]
  rotation: [number, number, number]
  lensIndex: number
  placedBy: string
}
```

### src/types/session.ts
```typescript
export type DeviceType = 'quest3' | 'vision_pro' | 'desktop' | 'mobile'

export interface Participant {
  uid: string
  displayName: string
  avatarColor: string
  device: DeviceType
  joinedAt: Date
}

export interface VRSession {
  id: string
  locationId: string
  virtualTourId: string
  sessionType: 'solo' | 'collaborative'
  status: 'active' | 'ended'
  accessCode: string | null
  hostUid: string
  participants: Participant[]
  virtualCameras: VirtualCamera[]
  croquetSessionId: string
  livekitRoomName: string
  createdAt: Date
}
```

### src/types/tools.ts
```typescript
export type ToolType = 'navigate' | 'measure' | 'annotate' | 'camera' | 'screenshot' | 'sunpath' | 'floorplan' | 'laser' | 'compare'

export interface ToolState {
  activeTool: ToolType
  measurementUnit: 'meters' | 'feet'
  laserActive: boolean
  sunTime: number       // 0-1 normalized (sunrise to sunset)
  sunDate: Date
}
```

---

## Reference Code Snippets

### Renderer Setup (lib/renderer.ts)
```typescript
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

export async function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  await renderer.init()
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  return renderer
}
```

### Scene Loading (lib/scene-loader.ts)
```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import * as THREE from 'three'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')

const ktx2Loader = new KTX2Loader()
ktx2Loader.setTranscoderPath('/basis/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)
gltfLoader.setKTX2Loader(ktx2Loader)

export async function loadScene(url: string, onProgress?: (progress: number) => void): Promise<THREE.Group> {
  const gltf = await gltfLoader.loadAsync(url, (event) => {
    if (onProgress && event.lengthComputable) {
      onProgress(event.loaded / event.total)
    }
  })
  return gltf.scene
}
```

### Data Flow (for reference, not a file to create)
```
User selects scene → loadScene(url) → GLTFLoader + DRACOLoader
  → THREE.Group (standard mesh with vertex colors)
    → Added to R3F scene graph
    → BVH built for raycasting (three-mesh-bvh)
    → Bounding box computed for camera spawn
    → Scene metadata stored in Zustand
  → Standard Three.js render loop
    → WebGPURenderer.render(scene, camera)
    → Standard z-buffer depth testing (no sorting, no custom shaders)
    → Native WebXR stereo rendering
```

---

## Database Schema (Firestore)

### Collection: virtual_tours
```
{
  id: string
  location_id: string
  tour_type: "triangle_mesh" | "panorama"
  mesh_urls: { preview: string, medium: string, high: string }
  triangle_count: number
  file_size: number
  bounds: { min: [x,y,z], max: [x,y,z] }
  spawn_point: { position: [x,y,z], rotation: [x,y,z] }
  viewpoints: [{ id, name, position, rotation, thumbnail_url }]
  floor_plan: { image_url, north_offset, bounds } | null
  qc_checklist: { no_artifacts, full_coverage, accurate_lighting, calibrated_scale, file_size_ok, lod_generated, viewpoints_marked, annotations_added }
  gps: { lat, lng }
  status: "draft" | "published"
  created_at: Timestamp
  updated_at: Timestamp
}
```

### Collection: vr_sessions
```
{
  id: string
  location_id: string
  virtual_tour_id: string
  session_type: "solo" | "collaborative"
  status: "active" | "ended"
  access_code: string | null
  host_uid: string
  participants: [{ uid, display_name, avatar_color, device, joined_at }]
  virtual_cameras: [{ id, position, rotation, lens_mm, placed_by }]
  croquet_session_id: string
  livekit_room_name: string
  created_at: Timestamp
}
```

### Collection: vr_annotations
```
{
  id: string
  location_id: string
  virtual_tour_id: string
  session_id: string | null
  position: [x,y,z]
  normal: [x,y,z]
  type: "power" | "parking" | "sound" | "light" | "access" | "ceiling" | "restriction" | "custom"
  title: { en: string, th: string }
  description: { en: string, th: string }
  measurement?: { start: [x,y,z], end: [x,y,z], distance: number }
  visibility: "private" | "team" | "public"
  created_by: string
  created_at: Timestamp
}
```

### Collection: vr_screenshots
```
{
  id: string
  location_id: string
  virtual_tour_id: string
  url: string
  lens_mm: number
  camera_position: [x,y,z]
  camera_rotation: [x,y,z]
  gps: { lat, lng }
  filename: string
  tags: string[]
  captured_by: string
  created_at: Timestamp
}
```

---

## API Routes

All routes under `/api/vr/` in the application.

| Endpoint | Methods | Purpose |
|---|---|---|
| /api/vr/tours | GET, POST | List and create tours |
| /api/vr/tours/[tourId] | GET, PUT, DELETE | Manage individual tour |
| /api/vr/tours/[tourId]/publish | POST | Publish tour (after QC) |
| /api/vr/tours/[tourId]/qc | PUT | Update QC checklist |
| /api/vr/sessions | GET, POST | List active and create sessions |
| /api/vr/sessions/[id]/join | POST | Join session |
| /api/vr/sessions/[id]/leave | POST | Leave session |
| /api/vr/annotations | GET, POST | List and create annotations |
| /api/vr/annotations/[id] | GET, PUT, DELETE | Manage annotation |
| /api/vr/screenshots | GET, POST | List and create screenshots |
| /api/vr/sun-position | GET | Sun position calculation |
| /api/vr/upload/mesh | POST | Signed URL for .glb upload |
| /api/vr/upload/panorama | POST | Signed URL for panorama upload |
| /api/vr/tokens/croquet | POST | Generate Croquet token |
| /api/vr/tokens/livekit | POST | Generate LiveKit token |
| /api/subscriptions/create-checkout | POST | Stripe checkout session |
| /api/subscriptions/webhook | POST | Stripe webhook handler |

---

## Implementation Roadmap — Task-by-Task

Each task is designed to be completable within ~50% of the context window. Only read files relevant to the current task.

### Progress Tracking

After completing each task, update this checklist by changing `[ ]` to `[x]`. This is how you track where you are across sessions.

---

### PHASE 1: Foundation (Weeks 1–2)

**Goal:** Triangle mesh rendering in browser with VR support. Prove the core thesis works.

#### Task 1.1: Project Scaffold
**Files to create:** package.json, tsconfig.json, vite.config.ts, tailwind.config.ts, src/main.tsx, src/App.tsx, index.html
**Files to read:** None (greenfield)
**What to build:**
- Initialize Vite + React 19 + TypeScript project
- Install core dependencies: three, @react-three/fiber, @react-three/drei, @react-three/xr, zustand, tailwindcss
- Configure TypeScript strict mode
- Configure Tailwind CSS v4
- Configure Vite with necessary plugins
- Create minimal App.tsx with a React Three Fiber Canvas placeholder
- Create main.tsx entry point
- Verify `tsc --noEmit` and `npx vite build` pass with zero errors
**Validation:** `npm run build` succeeds, dev server starts
- [x] Complete

#### Task 1.2: Type Definitions
**Files to create:** src/types/scene.ts, src/types/annotation.ts, src/types/camera.ts, src/types/session.ts, src/types/tools.ts
**Files to read:** Type definitions section above in this file
**What to build:**
- Create all five type files as specified in the Type Definitions section above
- Export all types and constants
**Validation:** `tsc --noEmit` passes
- [x] Complete

#### Task 1.3: Zustand Stores
**Files to create:** src/stores/viewer-store.ts, src/stores/tool-store.ts, src/stores/session-store.ts
**Files to read:** src/types/* (the types you just created)
**What to build:**
- `viewer-store.ts`: Scene URL, loading state, loaded THREE.Group ref, scene bounds, spawn point, current LOD level, error state
- `tool-store.ts`: Active tool (default: 'navigate'), measurement unit, laser active state, sun time/date, tool settings
- `session-store.ts`: Current session, participants list, is-collaborative flag, connection status
**Validation:** `tsc --noEmit` passes
- [x] Complete

#### Task 1.4: Scene Loader Library
**Files to create:** src/lib/scene-loader.ts, src/lib/formats.ts
**Files to read:** Reference code snippets above, src/types/scene.ts
**What to build:**
- `scene-loader.ts`: GLTFLoader configured with DRACOLoader and KTX2Loader as shown in reference snippets. Export `loadScene(url, onProgress?)` function.
- `formats.ts`: Helper to detect file format from URL/extension, validate it's a supported format (.glb, .gltf)
- Copy Draco WASM decoder files to `public/draco/` (from three/examples/jsm/libs/draco/gltf/)
- Copy KTX2/Basis transcoder files to `public/basis/` (from three/examples/jsm/libs/basis/)
**Validation:** `tsc --noEmit` passes
- [x] Complete

#### Task 1.5: WebGPU Renderer Setup
**Files to create:** src/lib/renderer.ts
**Files to read:** Reference code snippets above
**What to build:**
- WebGPURenderer factory function as shown in reference snippets
- NOTE: React Three Fiber v9+ may handle renderer creation differently. Check R3F docs for WebGPU integration. The `createRenderer` function may need to be passed to R3F's Canvas `gl` prop or used via `frameloop` customization.
- If R3F doesn't support WebGPURenderer directly yet, use WebGLRenderer as fallback — the meshes are standard and work with both.
**Validation:** `tsc --noEmit` passes
- [x] Complete

#### Task 1.6: ViewerShell + SceneRenderer
**Files to create:** src/components/viewer/ViewerShell.tsx, src/components/viewer/SceneRenderer.tsx
**Files to read:** src/lib/scene-loader.ts, src/lib/renderer.ts, src/stores/viewer-store.ts
**What to build:**
- `ViewerShell.tsx`: Main container component. Renders R3F `<Canvas>` with appropriate config (WebGPU or WebGL). Includes children for SceneRenderer, controls, tools. Handles canvas sizing.
- `SceneRenderer.tsx`: R3F component that loads a .glb scene URL from the viewer store, calls `loadScene()`, adds the returned THREE.Group to the scene. Computes bounding box, sets camera to spawn point at 1.6m eye height. Auto-centers scene.
- Wire up in App.tsx so it renders ViewerShell with SceneRenderer inside.
- For testing, use any .glb file (even a simple test cube). Place it in `public/scenes/`.
**Validation:** Dev server shows 3D scene in browser. `tsc --noEmit` passes.
- [x] Complete

#### Task 1.7: First-Person Controls
**Files to create:** src/components/controls/FirstPersonControls.tsx
**Files to read:** src/components/viewer/ViewerShell.tsx (to know where to add controls)
**What to build:**
- WASD movement with mouse look using PointerLockControls from drei
- Movement speed: 4 m/s, sprint (Shift): 8 m/s
- Delta-time-based movement (framerate-independent) using useFrame
- Eye height locked at 1.6m (override Y position each frame)
- Click on canvas to engage pointer lock
- ESC to release
**Validation:** Can navigate around the scene with WASD + mouse. Movement feels smooth.
- [x] Complete

#### Task 1.8: Environment System
**Files to create:** src/components/viewer/EnvironmentSettings.tsx
**Files to read:** src/stores/viewer-store.ts, src/components/viewer/ViewerShell.tsx
**What to build:**
- Use drei's `<Environment>` component with HDRI presets
- Support these presets: apartment, city, dawn, forest, lobby, night, park, studio, sunset, warehouse
- Also create a "neutral" option with no HDRI (just flat ambient light)
- Add controls for: ambient light intensity (0–2), directional light intensity (0–3), fog distance, background toggle, grid visibility
- Store selected preset and settings in viewer-store
- Simple UI panel (Tailwind styled) that toggles open/closed
**Validation:** Can switch HDRI environments. Lighting controls work. Scene appearance changes.
- [x] Complete

#### Task 1.9: WebXR Session Support
**Files to create:** src/components/controls/VRControls.tsx, src/hooks/useXRSession.ts
**Files to read:** src/components/viewer/ViewerShell.tsx, @react-three/xr docs
**What to build:**
- `useXRSession.ts`: Hook wrapping @react-three/xr session state (isPresenting, controllers, etc.)
- `VRControls.tsx`: Basic VR locomotion — thumbstick movement on Quest 3 controllers
- Add `<XR>` provider to ViewerShell (from @react-three/xr)
- Add "Enter VR" button to UI (use drei's or xr's built-in VR button)
- Ensure stereo rendering works with the standard mesh scene
**Validation:** "Enter VR" button appears. If a VR headset is connected, clicking it enters immersive VR mode. On desktop without headset, button appears but session fails gracefully.
- [x] Complete

#### Task 1.10: Loading Overlay + Error Boundary
**Files to create:** src/components/viewer/LoadingOverlay.tsx, src/components/viewer/ErrorBoundary.tsx
**Files to read:** src/stores/viewer-store.ts
**What to build:**
- `LoadingOverlay.tsx`: Full-screen overlay showing loading progress (percentage from scene loader onProgress callback). Shows current LOD stage later. Dismisses when scene is loaded.
- `ErrorBoundary.tsx`: React error boundary wrapping the 3D viewer. Catches Three.js / R3F errors gracefully. Shows friendly error message with retry button.
**Validation:** Loading overlay appears when loading a scene. Error boundary catches errors without crashing app.
- [x] Complete

#### Phase 1 Exit Criteria
- [x] Triangle mesh scene renders in browser
- [x] 60+ FPS on desktop (check with stats-gl or browser DevTools)
- [x] Desktop navigation working (WASD + mouse look)
- [x] WebXR "Enter VR" button present and functional
- [x] `tsc --noEmit && npx vite build` passes with zero errors

---

### PHASE 2: Scene Pipeline (Weeks 3–4)

**Goal:** End-to-end pipeline and progressive loading working.

#### Task 2.1: convert_scene.py Script
**Files to create:** scripts/convert_scene.py, scripts/requirements.txt
**Files to read:** None
**What to build:**
- Python script using trimesh and pygltflib (or just trimesh)
- Reads .off file (vertices, faces, vertex colors)
- Exports as .glb with vertex colors preserved
- Optional `--draco` flag for Draco mesh compression
- Usage: `python convert_scene.py input.off output.glb --draco`
- `requirements.txt`: trimesh, pygltflib, numpy
**Validation:** Script runs without errors on a test .off file. Output .glb loads in Three.js.
- [x] Complete

#### Task 2.2: generate_lod.py Script
**Files to create:** scripts/generate_lod.py
**Files to read:** scripts/convert_scene.py (for shared patterns)
**What to build:**
- Python script using trimesh
- Reads a high-quality .glb or .off file
- Generates three LOD levels via `simplify_quadric_decimation()`:
  - Preview: 50K–100K triangles
  - Medium: 200K–500K triangles
  - High: original (or capped at 5M)
- Output naming: `{base}_preview.glb`, `{base}_medium.glb`, `{base}_high.glb`
- All outputs have Draco compression
**Validation:** Script produces three .glb files of decreasing size.
- [ ] Complete

#### Task 2.3: validate_scene.py Script
**Files to create:** scripts/validate_scene.py
**Files to read:** None
**What to build:**
- Python script for QC checks on exported meshes
- Checks: triangle count within expected range, file size within targets, has vertex colors, no degenerate triangles, bounding box reasonable
- Prints pass/fail for each check
- Exit code 0 if all pass, 1 if any fail
**Validation:** Script runs on test .glb files and reports results.
- [ ] Complete

#### Task 2.4: Progressive LOD Loading
**Files to create:** src/hooks/useScene.ts (expand or create)
**Files to read:** src/lib/scene-loader.ts, src/stores/viewer-store.ts, src/types/scene.ts
**What to build:**
- `useScene` hook that accepts a SceneLOD object (preview/medium/high URLs)
- Immediately loads preview LOD and displays it
- In background, loads high-quality LOD
- When high quality is ready, seamlessly swaps it in (dispose preview, add high)
- Updates viewer-store with current LOD level
- Loading overlay shows which LOD is being loaded
**Validation:** Scene loads in two stages — fast preview, then quality swap. No visual glitch during swap.
- [ ] Complete

#### Task 2.5: Scene Selector UI
**Files to create:** src/components/viewer/SceneSelector.tsx
**Files to read:** src/stores/viewer-store.ts, src/hooks/useScene.ts
**What to build:**
- Side panel or modal listing available scenes
- For now, hardcode a list of local scenes from `public/scenes/`
- Show scene name, triangle count, file size, thumbnail (if available)
- Click to load scene via useScene hook
- Later phases will connect this to Firestore
**Validation:** Can browse and switch between multiple .glb scenes.
- [ ] Complete

#### Task 2.6: Performance Monitoring
**Files to read:** src/components/viewer/ViewerShell.tsx
**What to build:**
- Integrate stats-gl or drei's `<Stats>` component for FPS monitoring
- Toggle-able via keyboard shortcut (F key or similar)
- Show FPS, draw calls, triangle count, memory usage
- Add adaptive quality: if FPS drops below 30 for 3+ seconds, suggest switching to lower LOD
**Validation:** Stats overlay shows real-time FPS. Adaptive quality suggestion works.
- [ ] Complete

#### Phase 2 Exit Criteria
- [ ] Python scripts work: .off → .glb conversion, LOD generation, validation
- [ ] Progressive LOD loading works (instant preview → seamless high-quality swap)
- [ ] Multiple scenes loadable and switchable via UI
- [ ] Performance monitoring visible

---

### PHASE 3: Professional Tools (Weeks 5–8)

**Goal:** All scouting tools that differentiate VR Scout from competitors.

#### Task 3.1: BVH Raycaster Setup
**Files to create:** src/lib/raycaster.ts
**Files to read:** src/components/viewer/SceneRenderer.tsx
**What to build:**
- Install three-mesh-bvh
- After scene loads, build BVH acceleration structure on all meshes
- Export helper function `raycastScene(raycaster, scene)` that uses BVH for fast intersection
- This is the foundation for measurement tool, annotation placement, and teleportation
**Validation:** Raycasting returns intersection points on scene geometry. Verify with console.log on click.
- [ ] Complete

#### Task 3.2: Measurement Tool
**Files to create:** src/components/tools/MeasurementTool.tsx, src/hooks/useMeasurement.ts
**Files to read:** src/lib/raycaster.ts, src/stores/tool-store.ts, src/types/annotation.ts
**What to build:**
- `useMeasurement.ts`: State for active measurements. Array of measurement lines (start, end, distance). Active measurement in progress.
- `MeasurementTool.tsx`: When measurement tool is active, click to place first point, click again to place second point. Draw a line between them with distance label. Use BVH raycasting for point placement.
- Display distance in meters or feet (from tool-store preference)
- Persistent measurements (stay until explicitly deleted)
- Visual: thin line with floating distance text label at midpoint
- VR mode: use controller ray + trigger to place points
**Validation:** Can measure distances between two points on the scene. Distance label shows correctly.
- [ ] Complete

#### Task 3.3: Annotation System
**Files to create:** src/components/tools/AnnotationTool.tsx, src/components/tools/AnnotationMarker.tsx, src/hooks/useAnnotations.ts
**Files to read:** src/lib/raycaster.ts, src/types/annotation.ts, src/stores/tool-store.ts
**What to build:**
- `useAnnotations.ts`: CRUD operations for annotations array. Add, update, delete, list by type.
- `AnnotationTool.tsx`: When annotation tool is active, click on scene geometry to place. Shows type selector (8 types from annotation types). Title/description fields (EN only for now, TH later). Visibility selector (private/team/public).
- `AnnotationMarker.tsx`: 3D billboard sprite for each annotation. Shows icon and color from ANNOTATION_TYPES. Click to expand details panel. Oriented to face the surface normal.
- All annotations placed via BVH raycasting
- For now, stored in local Zustand state. Firestore persistence comes in Phase 5.
**Validation:** Can place annotations of different types on scene geometry. Markers visible and clickable.
- [ ] Complete

#### Task 3.4: Virtual Camera System
**Files to create:** src/components/camera-system/VirtualCameraObject.tsx, src/components/camera-system/FloatingMonitor.tsx, src/components/camera-system/LensRadialMenu.tsx, src/components/camera-system/CameraManager.tsx, src/components/camera-system/CameraSpawnMenu.tsx, src/hooks/useVirtualCamera.ts
**Files to read:** src/types/camera.ts, src/stores/tool-store.ts
**What to build:**
- `useVirtualCamera.ts`: Manages up to 3 virtual cameras. CRUD for cameras. Active camera selection. Lens changes.
- `CameraManager.tsx`: Renders all active virtual cameras and their monitors
- `VirtualCameraObject.tsx`: A grabbable 3D object representing a camera in the scene. Visual model (simple box/cone geometry). Draggable on desktop (drei's useDrag or pointer events). In VR: grabbable with controller grip.
- `FloatingMonitor.tsx`: Render-to-texture display showing what each virtual camera sees. Uses THREE.WebGLRenderTarget / offscreen rendering. Grabbable quad in 3D space near its camera. Updates at reduced framerate (15-30fps) to save performance.
- `LensRadialMenu.tsx`: Radial menu for lens selection. Shows all 6 cinema lenses. Changes the virtual camera's FOV.
- `CameraSpawnMenu.tsx`: UI to spawn a new camera (button in toolbar). Max 3 cameras enforced.
**Validation:** Can spawn a virtual camera, see its viewpoint on a floating monitor, change lenses, reposition it.
- [ ] Complete

#### Task 3.5: Screenshot Tool
**Files to create:** src/components/tools/ScreenshotTool.tsx, src/lib/screenshot.ts
**Files to read:** src/types/camera.ts, src/hooks/useVirtualCamera.ts
**What to build:**
- `screenshot.ts`: Capture canvas as image. Embed EXIF metadata (using a library like exifr or piexifjs): location ID, lens focal length, camera position/rotation, timestamp, GPS coordinates.
- `ScreenshotTool.tsx`: Button to capture current view or a specific virtual camera's view. File naming: `LOC-{location_id}_{lens}mm_{YYYY-MM-DD}_{sequence}.jpg`. Download to user's device. Show flash effect on capture.
**Validation:** Screenshot captures and downloads with correct filename. EXIF metadata present.
- [ ] Complete

#### Task 3.6: Sun-Path Simulator
**Files to create:** src/components/tools/SunPathSimulator.tsx, src/hooks/useSunPath.ts
**Files to read:** src/stores/tool-store.ts
**What to build:**
- Install `suncalc` library
- `useSunPath.ts`: Given GPS coordinates + date + time, compute sun azimuth and altitude using suncalc. Compute light color temperature based on sun altitude.
- `SunPathSimulator.tsx`: Time-of-day slider (sunrise → sunset). Date picker for seasonal variation. Golden hour quick-jump buttons (morning golden hour, evening golden hour). 3D sun indicator (bright sphere in sky at sun position). Compass overlay showing N/S/E/W. Directional light automatically tracks sun position and color temperature.
**Validation:** Moving time slider changes lighting direction and color. Sun indicator moves across sky.
- [ ] Complete

#### Task 3.7: Floor Plan Overlay
**Files to create:** src/components/tools/FloorPlanOverlay.tsx
**Files to read:** src/types/scene.ts (FloorPlan type), src/stores/viewer-store.ts
**What to build:**
- 2D minimap overlay in corner of screen
- Loads a floor plan image from scene data
- Shows user position as a dot (mapped from 3D position to 2D floor plan coordinates)
- North rotation offset applied
- Click on minimap to teleport to that position in 3D
- Toggle-able visibility
**Validation:** Minimap shows with user position dot. Position updates as user moves. Click to teleport works.
- [ ] Complete

#### Task 3.8: Location Comparison Viewer
**Files to create:** src/components/comparison/ComparisonViewer.tsx
**Files to read:** src/hooks/useScene.ts, src/components/viewer/SceneRenderer.tsx
**What to build:**
- Split-screen mode showing two scenes side by side
- Each side has independent camera controls
- Option for synchronized rotation (both cameras move together)
- Independent lens selection per side
- Quick-swap button to switch which scene is on which side
- Uses two R3F Canvas instances or a split viewport approach
**Validation:** Two scenes render side by side. Independent navigation works. Sync toggle works.
- [ ] Complete

#### Task 3.9: Laser Pointer
**Files to create:** src/components/tools/LaserPointer.tsx
**Files to read:** src/lib/raycaster.ts, src/stores/tool-store.ts
**What to build:**
- When activated (L key hold on desktop, controller trigger hold in VR):
  - Thin beam from camera/controller to scene intersection point
  - Glow dot at intersection point
  - Color assigned per user (from session participant color)
- Uses BVH raycasting for hit point
- Visible to all users (collaboration sync comes in Phase 4)
- For now, single-user only
**Validation:** Holding L shows laser beam to scene surface. Glow dot appears at hit point.
- [ ] Complete

#### Task 3.10: Desktop Toolbar
**Files to create:** src/components/ui/Toolbar.tsx
**Files to read:** src/stores/tool-store.ts, src/types/tools.ts
**What to build:**
- Horizontal toolbar at bottom or side of screen
- Tool buttons: Navigate, Measure, Annotate, Camera, Screenshot, Sun Path, Floor Plan, Laser, Compare
- Active tool highlighted
- Keyboard shortcuts (1-9 for tools)
- Settings button opens SettingsPanel
**Validation:** All tools selectable from toolbar. Active tool visually indicated. Keyboard shortcuts work.
- [ ] Complete

#### Phase 3 Exit Criteria
- [ ] All tools functional in desktop mode
- [ ] Measurement accuracy reasonable on test scenes
- [ ] Virtual camera render-to-texture working
- [ ] Screenshot metadata matches specification
- [ ] Sun path simulation changes lighting realistically
- [ ] Toolbar provides access to all tools

---

### PHASE 4: Collaboration (Weeks 9–11)

**Goal:** Multi-user sessions with shared tools and voice.

#### Task 4.1: Croquet Session Setup
**Files to create:** src/components/collaboration/SessionManager.tsx, src/hooks/useCollaboration.ts
**Files to read:** src/stores/session-store.ts, src/types/session.ts, Croquet.io docs
**What to build:**
- Install @croquet/croquet-react or appropriate Croquet SDK
- `useCollaboration.ts`: Hook for Croquet session lifecycle. Create session, join session, leave session. Handle connection/disconnection.
- `SessionManager.tsx`: Create/join session UI. Access code entry for private sessions. Connection status indicator.
- Define Croquet model for shared state: participant positions, annotations, measurements, virtual cameras, laser pointers
**Validation:** Can create a session and see it active. Second browser tab can join the same session.
- [ ] Complete

#### Task 4.2: Participant Presence
**Files to create:** src/components/collaboration/ParticipantAvatars.tsx, src/components/collaboration/ParticipantList.tsx
**Files to read:** src/hooks/useCollaboration.ts, src/types/session.ts
**What to build:**
- `ParticipantAvatars.tsx`: 3D avatar for each remote participant. Simple colored shape (cone/cylinder) at their position. Rotated to show facing direction. Name label above. Color-coded per participant.
- `ParticipantList.tsx`: 2D UI panel showing session roster. Display name, device type icon, connection status. Mute/volume controls per participant.
- Broadcast local player position/rotation at ~10Hz via Croquet
**Validation:** Two browser tabs show each other's avatars at correct positions. Participant list shows both users.
- [ ] Complete

#### Task 4.3: Shared Tool State
**Files to read:** src/hooks/useAnnotations.ts, src/hooks/useMeasurement.ts, src/hooks/useVirtualCamera.ts, src/hooks/useCollaboration.ts
**What to build:**
- Sync annotations via Croquet: when one user places an annotation, all see it
- Sync measurements via Croquet: shared measurement lines visible to all
- Sync virtual cameras via Croquet: all users see and can interact with shared cameras
- Sync laser pointers: visible to all session members
- Use Croquet's deterministic model to ensure consistency
**Validation:** Annotation placed by user A appears for user B. Same for measurements, cameras, laser pointers.
- [ ] Complete

#### Task 4.4: LiveKit Spatial Voice
**Files to create:** src/components/collaboration/VoiceChatControls.tsx, src/hooks/useVoiceChat.ts
**Files to read:** src/hooks/useCollaboration.ts, LiveKit docs
**What to build:**
- Install @livekit/components-react and livekit-client
- `useVoiceChat.ts`: Connect to LiveKit room. Manage audio tracks. Position audio at participant locations (using Web Audio API spatialization).
- `VoiceChatControls.tsx`: Push-to-talk toggle vs open mic. Mute button. Volume slider. Speaking indicator per participant.
- Create LiveKit room when collaborative session starts
**Validation:** Two users can hear each other. Audio appears to come from the other user's position in 3D space.
- [ ] Complete

#### Task 4.5: VR Collaboration Features
**Files to create:** src/components/controls/TeleportController.tsx, src/components/controls/VRMenu.tsx, src/components/ui/HUD.tsx
**Files to read:** src/hooks/useXRSession.ts, src/components/controls/VRControls.tsx
**What to build:**
- `TeleportController.tsx`: Arc pointer from controller. Click thumbstick to teleport. Uses BVH raycasting for destination. Visual arc with destination indicator.
- `VRMenu.tsx`: Radial menu activated by button press. Shows all tools. Select by pointing + trigger.
- `HUD.tsx`: In-VR heads-up display. Shows: active tool, participant count, measurement readout, minimap.
- Ensure all collaboration features work in VR (avatars visible, voice positioned, tools synced)
**Validation:** Can teleport in VR. Radial menu works for tool selection. HUD shows relevant info.
- [ ] Complete

#### Phase 4 Exit Criteria
- [ ] 2+ users in same VR scene simultaneously
- [ ] Shared annotations visible to all participants
- [ ] Spatial voice chat working
- [ ] Session lifecycle (create → join → collaborate → leave) complete
- [ ] VR teleportation and menu functional

---

### PHASE 5: Backend & Persistence (Weeks 12–14)

**Goal:** Firebase integration, cloud storage, data persistence.

#### Task 5.1: Firebase Setup
**Files to create:** src/lib/firebase.ts, .env.local (template)
**Files to read:** None
**What to build:**
- Install firebase SDK
- `firebase.ts`: Initialize Firebase app, Firestore, Auth exports
- Environment variables for Firebase config (API key, project ID, etc.)
- Create `.env.local.example` with required variable names
**Validation:** Firebase initializes without errors.
- [ ] Complete

#### Task 5.2: Authentication
**Files to create:** src/hooks/useAuth.ts, src/components/ui/AuthGate.tsx
**Files to read:** src/lib/firebase.ts, src/App.tsx
**What to build:**
- `useAuth.ts`: Firebase Auth hook. Sign in (email/password, Google). Sign out. Current user state. Auth state listener.
- `AuthGate.tsx`: Wrapper component that requires authentication. Shows sign-in form if not authenticated. Passes user context to children.
- Wire into App.tsx — viewer requires authentication
**Validation:** Can sign in, see user info, sign out. Viewer requires auth.
- [ ] Complete

#### Task 5.3: Tour CRUD
**Files to create:** src/lib/firestore/tours.ts
**Files to read:** src/lib/firebase.ts, src/types/scene.ts
**What to build:**
- Firestore CRUD for virtual_tours collection
- Functions: createTour, getTour, updateTour, deleteTour, listTours
- Follows schema from Database Schema section
- Includes QC checklist update function
- Publish function (validates QC checklist is complete)
**Validation:** Can create, read, update, delete tours in Firestore.
- [ ] Complete

#### Task 5.4: Annotation Persistence
**Files to create:** src/lib/firestore/annotations.ts
**Files to read:** src/lib/firebase.ts, src/types/annotation.ts, src/hooks/useAnnotations.ts
**What to build:**
- Firestore CRUD for vr_annotations collection
- Functions: createAnnotation, getAnnotation, updateAnnotation, deleteAnnotation, listAnnotationsByTour
- Update useAnnotations hook to load from / save to Firestore
- Real-time listener for annotation changes (Firestore onSnapshot)
**Validation:** Annotations persist across page reloads. Real-time sync between tabs.
- [ ] Complete

#### Task 5.5: Session Persistence
**Files to create:** src/lib/firestore/sessions.ts
**Files to read:** src/lib/firebase.ts, src/types/session.ts
**What to build:**
- Firestore CRUD for vr_sessions collection
- Functions: createSession, getSession, joinSession, leaveSession, listActiveSessions
- Track participants, session status, access codes
- Auto-end sessions when host leaves or after inactivity timeout
**Validation:** Sessions persist in Firestore. Join/leave updates reflected.
- [ ] Complete

#### Task 5.6: Screenshot Persistence
**Files to create:** src/lib/firestore/screenshots.ts
**Files to read:** src/lib/firebase.ts, src/types/scene.ts
**What to build:**
- Firestore CRUD for vr_screenshots collection
- Functions: saveScreenshot, listScreenshots, deleteScreenshot
- Screenshot gallery component showing all captures for a tour
- Download and share functionality
**Validation:** Screenshots saved to Firestore. Gallery shows all captures.
- [ ] Complete

#### Task 5.7: Cloudflare R2 Upload
**Files to create:** src/lib/r2-upload.ts
**Files to read:** src/lib/firebase.ts
**What to build:**
- Client-side upload via signed URLs
- API route to generate signed upload URLs (this requires a server function — use Firebase Functions or a simple API endpoint)
- Upload .glb files to R2
- Store resulting URLs in Firestore tour document
- Progress indicator during upload
**Validation:** Can upload a .glb file. URL is stored and scene loads from R2.
- [ ] Complete

#### Task 5.8: Settings Panel
**Files to create:** src/components/ui/SettingsPanel.tsx
**Files to read:** src/stores/viewer-store.ts, src/stores/tool-store.ts
**What to build:**
- Slide-out settings panel
- Sections: Display (quality, LOD), Controls (sensitivity, movement speed), Tools (measurement unit, laser color), Audio (voice chat settings), Account (user info, sign out)
- Settings persist to localStorage
**Validation:** Settings panel opens/closes. Changes apply immediately. Persist across page reloads.
- [ ] Complete

#### Phase 5 Exit Criteria
- [ ] Tours persist across sessions
- [ ] Annotations saved and restored from Firestore
- [ ] Scene files hosted on R2 and loading correctly
- [ ] User authentication working
- [ ] Screenshots saved and viewable in gallery

---

### PHASE 6: Monetization & Polish (Weeks 15–18)

**Goal:** Production-ready with subscriptions and quality assurance.

#### Task 6.1: Stripe Integration
**Files to create:** src/lib/stripe.ts, API route for checkout, API route for webhooks
**Files to read:** Stripe docs
**What to build:**
- Stripe checkout session creation for Scout and Studio tiers
- Webhook handler for subscription events (created, updated, cancelled)
- Store subscription status in Firestore user document
- Gate features based on subscription tier
- Free trial support
**Validation:** Can initiate Stripe checkout. Webhook processes subscription events.
- [ ] Complete

#### Task 6.2: VR Dashboard
**Files to create:** src/components/dashboard/ (multiple files)
**Files to read:** src/lib/firestore/tours.ts, src/types/scene.ts
**What to build:**
- Tour management dashboard (list, create, edit, delete tours)
- QC checklist interface per tour
- Analytics overview (views, sessions, screenshots)
- Scene upload workflow (drag & drop .glb → upload to R2 → create tour)
- Tour publishing flow (QC must pass before publish)
**Validation:** Full tour lifecycle manageable from dashboard. QC enforced before publishing.
- [ ] Complete

#### Task 6.3: Test Suites
**Files to create:** tests/unit/*.test.ts, tests/e2e/*.spec.ts, vitest.config.ts, playwright.config.ts
**Files to read:** Key source files being tested
**What to build:**
- Vitest unit tests for: stores, hooks, lib functions, type validation
- Playwright E2E tests for: scene loading, tool usage, authentication flow
- Target 60%+ code coverage
- FPS benchmarking test (load scene, measure frame rate over 10 seconds)
**Validation:** `npm run test` passes. Coverage report shows 60%+.
- [ ] Complete

#### Task 6.4: Performance Optimization
**Files to read:** Performance-critical components
**What to build:**
- Profile rendering performance
- Optimize draw calls (merge meshes if needed, instance where possible)
- Ensure <50 draw calls in VR
- Lazy load non-critical components
- Code splitting for tools not currently active
- Image/asset optimization
- Verify all performance targets from Performance Targets section
**Validation:** All performance targets met. FPS stable in VR.
- [ ] Complete

#### Task 6.5: i18n (English + Thai)
**Files to create:** src/i18n/ directory, translation files
**Files to read:** UI components
**What to build:**
- Install next-intl or react-i18next (since we're in Vite, use react-i18next)
- English and Thai translations for all UI strings
- Language selector in settings
- Annotation titles/descriptions support EN/TH bilingual fields
**Validation:** Can switch between English and Thai. All visible strings translated.
- [ ] Complete

#### Task 6.6: Accessibility
**Files to read:** UI components
**What to build:**
- Keyboard navigation for all 2D UI elements
- ARIA labels on interactive elements
- Screen reader support for toolbar, settings, scene selector
- High contrast mode option
- Focus indicators
**Validation:** Can navigate all UI with keyboard only. Screen reader announces elements correctly.
- [ ] Complete

#### Phase 6 Exit Criteria
- [ ] Subscription flow complete (free trial → paid)
- [ ] QC checklist enforced before tour publishing
- [ ] 60%+ test coverage
- [ ] All performance targets met
- [ ] Cross-device compatibility verified
- [ ] i18n working for EN and TH
- [ ] Accessibility basics covered

---

## Feature Specifications Reference

### Environment System Presets
apartment, city, dawn, forest, lobby, night, park, studio, sunset, warehouse, neutral

### Annotation Types
| Type | Icon | Label | Color |
|---|---|---|---|
| power | ⚡ | Electrical Panel/Outlet | #FBBF24 |
| parking | P | Vehicle Access/Parking | #3B82F6 |
| sound | 🔇 | Sound Issue | #EF4444 |
| light | ☀ | Natural Light Source | #F59E0B |
| access | 🚪 | Load-in/Access Point | #10B981 |
| ceiling | 🔍 | Ceiling Height | #8B5CF6 |
| restriction | ⚠ | Restriction/Limitation | #F97316 |
| custom | 📝 | Custom Note | #6B7280 |

### Cinema Lenses
| Focal Length | FOV | Name |
|---|---|---|
| 18mm | 90° | Ultra Wide |
| 24mm | 73° | Wide |
| 35mm | 54° | Standard |
| 50mm | 39° | Normal |
| 85mm | 24° | Portrait |
| 135mm | 15° | Telephoto |

### Screenshot Naming
`LOC-{location_id}_{lens}mm_{YYYY-MM-DD}_{sequence}.jpg`

### Screenshot EXIF Metadata
Location ID, location name, lens focal length, camera position (x,y,z), camera rotation (yaw,pitch,roll), timestamp (ISO 8601), GPS coordinates, capturing user.

### QC Checklist (required before publish)
- No floating artifacts
- Full spatial coverage
- Accurate lighting / natural colors
- Calibrated scale
- File size within targets
- LOD versions generated
- Key viewpoints marked
- Production annotations added

### Collaboration — Synchronized State (Croquet)
Participant presence, laser pointers, annotations, measurements, virtual cameras, floating monitors, session events.

### Collaboration — Independent State (per user)
Camera position/rotation, FOV/lens for their view, active tool selection.

### VR Headset Targets
- **Primary:** Meta Quest 3 (controllers + hands)
- **High:** Meta Quest 3S (controllers + hands)
- **Medium:** Apple Vision Pro (gaze + pinch), Samsung Galaxy XR, Pico 4 Ultra

### Browser Support
- Chrome 113+ (WebGPU + WebXR)
- Quest Browser (WebGPU + WebXR) — primary VR target
- visionOS Safari (WebGPU + WebXR)
- Edge 113+ (WebGPU + WebXR)
- Safari 17+ (WebGPU, no WebXR)
- Firefox 147+ (WebGPU + WebXR)

### Fallback Strategy
- No WebGPU → WebGL 2.0 (Three.js auto-fallback with standard meshes)
- No VR headset → Desktop 3D viewing with mouse/touch orbit
- Low-end device → Serve preview LOD (50K–100K triangles)

---

## Scene Pipeline Reference (for Python scripts)

### Triangle Splatting Training (done offline on MSI laptop, NOT in this app)
```bash
python train_game_engine.py -s <colmap_data_path> -m <output_model_path> --eval
python train_game_engine.py -s <colmap_data_path> -m <output_model_path> --outdoor --eval
```

### Export to .off
```bash
python create_off.py --model <path_to_point_cloud_state_dict.pt> --output scene.off
```

### Convert .off → .glb (our script)
```bash
python scripts/convert_scene.py scene.off scene.glb --draco
```

### Generate LOD variants (our script)
```bash
python scripts/generate_lod.py scene.glb --output-dir ./lods/
```

### LOD Targets
| Level | Triangles | Compressed Size | Use Case |
|---|---|---|---|
| Preview | 50K–100K | 1–5 MB | Instant load |
| Medium | 200K–500K | 5–20 MB | WiFi/5G |
| High | 1M–5M | 20–60 MB | Full VR |

### File Naming
`{location_id}_mesh_{quality}_{version}.glb`

---

## References

- Triangle Splatting paper: https://arxiv.org/abs/2505.19175
- Triangle Splatting code: https://github.com/trianglesplatting/triangle-splatting (Apache 2.0)
- Triangle Splatting+ paper: https://arxiv.org/abs/2509.25122
- Pre-trained models: https://drive.google.com/drive/folders/1YrH9IVU8QWgfnIg_i0iRHq_M9rNCNPyV
- Game engine demo meshes: https://drive.google.com/drive/folders/1_TMXEFTdEACpHHvsmc5UeZMM-cMgJ3xW
- React Three Fiber: https://docs.pmnd.rs
- @react-three/xr: https://pmnd.rs
- Three.js WebGPURenderer: https://threejs.org/docs/
- three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh
- Croquet: https://croquet.io
- LiveKit: https://docs.livekit.io
