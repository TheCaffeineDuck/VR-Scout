# VR Scout v3 — Comprehensive Project Audit

**Generated**: 2026-03-16
**Auditor**: Claude Opus 4.6 (automated)
**Scope**: Full codebase + scene data + design plan comparison

---

## 1. Directory Scan

### Source Tree (excluding caches, node_modules, .git)

```
vr-scout-v3/
├── .claude/
│   ├── launch.json              # Dev server launch configs (WSL + Windows)
│   └── settings.local.json
├── .gitattributes
├── .gitignore
├── BUILD_PLAN.md                # Agent-executable build plan (1295 lines)
├── CLAUDE.md                    # Agent instructions
├── SETUP.md                     # Environment setup guide
├── client/
│   ├── .gitignore
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html               # Main entry HTML
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json            # References tsconfig.app.json + tsconfig.node.json
│   ├── tsconfig.app.json        # Strict mode, ES2023, React JSX
│   ├── tsconfig.node.json
│   ├── vite.config.ts           # Proxy to :8002, dual entry (main + standalone)
│   ├── dist/                    # Built output (committed — should be gitignored)
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   └── src/
│       ├── main.tsx             # React 19 entry point
│       ├── App.tsx              # BrowserRouter + Routes
│       ├── App.css              # Contains unused .hero class referencing hero.png
│       ├── index.css            # Global styles + CSS custom properties (dark/light)
│       ├── api/
│       │   ├── client.ts        # REST API client (all endpoints)
│       │   └── ws.ts            # WebSocket hook
│       ├── assets/
│       │   ├── hero.png         # UNUSED — only referenced in App.css which is not imported
│       │   ├── react.svg        # UNUSED — Vite template leftover
│       │   └── vite.svg         # UNUSED — Vite template leftover
│       ├── components/
│       │   ├── dashboard/
│       │   │   ├── SceneCard.tsx / .css
│       │   │   └── SceneDashboard.tsx / .css
│       │   ├── layout/
│       │   │   ├── ConfirmDialog.tsx / .css
│       │   │   ├── MainContent.tsx / .css
│       │   │   ├── SceneNav.tsx / .css
│       │   │   └── Sidebar.tsx / .css
│       │   ├── pipeline/
│       │   │   ├── CameraFrustum.tsx      # R3F camera frustum visualization
│       │   │   ├── LogViewer.tsx / .css
│       │   │   ├── PipelineMonitor.tsx / .css
│       │   │   ├── SparseCloudViewer.tsx / .css
│       │   │   ├── StepItem.tsx / .css
│       │   │   ├── StepList.tsx / .css
│       │   │   ├── TrainingCharts.tsx / .css
│       │   │   └── ValidationReport.tsx / .css
│       │   ├── qa/
│       │   │   ├── FloorPlaneAdjuster.tsx / .css
│       │   │   └── QAReview.tsx / .css
│       │   ├── settings/
│       │   │   └── SettingsScreen.tsx / .css
│       │   ├── upload/
│       │   │   ├── PipelineConfig.tsx / .css
│       │   │   ├── UploadPanel.tsx / .css
│       │   │   └── UploadScreen.tsx / .css
│       │   └── viewer/
│       │       ├── FPSCounter.tsx / .css
│       │       ├── SceneRenderer.tsx / .css  # Core Spark/R3F viewer
│       │       └── ViewerControls.tsx / .css
│       ├── hooks/
│       │   ├── usePipelineStatus.ts
│       │   ├── useScenes.ts
│       │   └── useTrainingMetrics.ts
│       ├── types/
│       │   ├── pipeline.ts
│       │   ├── scene.ts
│       │   └── ws.ts
│       ├── utils/
│       │   ├── constants.ts
│       │   └── format.ts
│       └── viewer/
│           ├── standalone.html   # Standalone viewer entry HTML
│           └── standalone.tsx    # Standalone viewer entry point
├── config/
│   └── pipeline_defaults.json   # Default pipeline parameters
├── docs/
│   └── VrScout_v3_design_plan.md  # Original design document (1773 lines)
├── raw/
│   └── library_area.mp4 → symlink  # Symlink to scenes/scene_1773578764403/raw/
├── scenes/
│   ├── library_area/            # Complete pipeline output (2.0 GB)
│   └── outdoor_rooftop/         # Migrated v2 scene (71 MB, output only)
├── scripts/
│   ├── align_scene.py           # Post-training alignment adjustment
│   ├── bootstrap.sh             # Environment setup (conda, gsplat, deps)
│   ├── ckpt_to_ply.py           # gsplat .pt → PLY converter
│   ├── compare_runs.py          # A/B test metrics comparison
│   ├── extract_metadata.py      # Video + SRT metadata extraction
│   ├── generate_geo_reference.py  # GPS → COLMAP geo-registration
│   ├── process.sh               # Main pipeline orchestrator (648 lines)
│   ├── validate_colmap.py       # COLMAP reconstruction validator
│   └── validate_gravity.py      # Gimbal vs COLMAP gravity comparison
├── server/
│   ├── __init__.py
│   ├── config.py                # Pydantic Settings (VRS_ prefix)
│   ├── db.py                    # SQLite async layer (aiosqlite)
│   ├── db.sqlite                # EMPTY (0 bytes) — stale file
│   ├── main.py                  # FastAPI app entry
│   ├── requirements.txt
│   ├── security.py              # Path sanitization, rate limiting
│   ├── models/
│   │   ├── __init__.py
│   │   ├── pipeline.py          # Pydantic v2 models
│   │   ├── scene.py
│   │   └── ws.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── health.py
│   │   ├── pipeline.py
│   │   ├── scenes.py
│   │   └── upload.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── gpu_poller.py        # nvidia-smi background poller
│   │   ├── metrics_parser.py    # Training log parser + anomaly detection
│   │   ├── pipeline_service.py  # Subprocess orchestration (WSL-aware)
│   │   └── status_watcher.py    # status.json polling + WS broadcast
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_health.py
│   │   ├── test_scenes.py
│   │   ├── test_security.py
│   │   ├── test_services.py
│   │   └── test_upload.py
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── colmap_reader.py     # Binary COLMAP file parser
│   │   ├── geo_utils.py         # GPS/ENU conversion
│   │   └── metadata_extractor.py  # ffprobe + SRT parsing
│   └── ws/
│       ├── __init__.py
│       └── manager.py           # WebSocket connection manager
└── tools/
    └── (gsplat clone — gitignored)
```

### Orphaned / Unnecessary Files

| File | Issue |
|------|-------|
| `client/src/assets/hero.png` (45 KB) | Referenced only in `App.css` `.hero` class; `App.css` is never imported |
| `client/src/assets/react.svg` | Vite template leftover, never imported |
| `client/src/assets/vite.svg` | Vite template leftover, never imported |
| `client/src/App.css` | Not imported by `App.tsx` or any component — entire file is dead |
| `server/db.sqlite` (0 bytes) | Empty file; actual DB is `vr_scout.db` per config.py default |
| `client/dist/` | Built output checked into git; should be in `.gitignore` |
| `.gitkeep` (root) | Serves no purpose at repo root |
| `raw/library_area.mp4` | Broken symlink pointing to `scenes/scene_1773578764403/raw/` (scene ID mismatch) |

### Empty Directories

None found (all directories contain files).

---

## 2. Tech Stack Inventory

### Frontend Dependencies (`client/package.json`)

| Dependency | Version | Type | Notes |
|-----------|---------|------|-------|
| react | ^19.2.4 | Direct | Latest React 19 |
| react-dom | ^19.2.4 | Direct | |
| react-router-dom | ^7.13.1 | Direct | v7 with file-based routing support |
| @react-three/fiber | ^9.5.0 | Direct | R3F v9 for Three.js integration |
| three | ^0.183.2 | Direct | Three.js r183 |
| @sparkjsdev/spark | ^0.1.10 | Direct | Gaussian Splat WebGL2 renderer |
| recharts | ^3.8.0 | Direct | Training metrics charts |
| typescript | ~5.9.3 | Dev | |
| vite | ^8.0.0 | Dev | Vite 8 |
| @vitejs/plugin-react | ^6.0.0 | Dev | |
| eslint | ^9.39.4 | Dev | With typescript-eslint + react-hooks |
| prettier | ^3.8.1 | Dev | Code formatter |
| @types/three | ^0.183.1 | Dev | |
| @types/react | ^19.2.14 | Dev | |
| @types/node | ^24.12.0 | Dev | |

### Backend Dependencies (`server/requirements.txt`)

| Dependency | Version | Type | Notes |
|-----------|---------|------|-------|
| fastapi | >=0.115.0 | Direct | Modern FastAPI |
| uvicorn[standard] | >=0.34.0 | Direct | ASGI server |
| websockets | >=14.0 | Direct | WebSocket support |
| aiosqlite | >=0.20.0 | Direct | Async SQLite |
| python-multipart | >=0.0.18 | Direct | File upload support |
| pydantic | >=2.10.0 | Direct | v2 models |
| pydantic-settings | >=2.7.0 | Direct | Environment config |

### External Tools (Pipeline)

| Tool | Install Method | Used In |
|------|---------------|---------|
| COLMAP | conda (conda-forge) | `process.sh` — SfM reconstruction |
| gsplat | pip from git clone | `process.sh` — 3DGS training |
| 3dgsconverter | pip from git | `process.sh` — PLY→SPZ conversion |
| ffmpeg | winget (Windows) / apt (WSL) | `process.sh` — frame extraction |
| ffprobe | bundled with ffmpeg | `server/utils/metadata_extractor.py` |
| nvidia-smi | GPU driver | `server/services/gpu_poller.py` |

### Build Tools

| Tool | Config File | Notes |
|------|-------------|-------|
| Vite 8 | `client/vite.config.ts` | Dev server on :3000, proxy to :8002 |
| TypeScript 5.9 | `client/tsconfig.app.json` | Strict mode, ES2023 target |
| ESLint 9 | `client/eslint.config.js` | Flat config, typescript-eslint |
| Ruff 0.15.6 | `.ruff_cache/` (no config file) | Python linting (implicit config) |
| mypy | `.mypy_cache/` (no config file) | Python type checking (implicit config) |

### Potential Issues

- **No `ruff.toml` or `pyproject.toml`**: Ruff and mypy run with defaults; no explicit Python linting config checked in
- **No `Dockerfile` or `docker-compose.yml`**: No containerization
- **No CI/CD config**: No GitHub Actions, no `.github/` directory
- **`client/dist/` committed**: Build output should be gitignored, not checked in

---

## 3. Frontend Architecture

### Entry Point & Routing

**Entry**: `client/src/main.tsx` → `<App />` in StrictMode
**Router**: BrowserRouter (react-router-dom v7)

```
Routes:
  /                          → SceneDashboard
  /upload                    → UploadScreen (new scene)
  /scene/:id/upload          → UploadScreen (existing scene)
  /scene/:id/pipeline        → PipelineMonitor
  /scene/:id/review          → QAReview
  /settings                  → SettingsScreen
```

**Layout**: `AppLayout` wraps all routes with `<Sidebar />` + `<MainContent />` (Outlet pattern).

### Component Tree

```
App
└── AppLayout
    ├── Sidebar                     # Navigation + scene list
    │   ├── useScenes()             # Fetches /api/scenes
    │   └── ConfirmDialog           # Delete confirmation
    └── MainContent (Outlet)
        ├── SceneDashboard
        │   ├── SceneCard[]         # Per-scene cards with status badges
        │   │   └── ConfirmDialog   # Delete confirmation
        │   └── useScenes()
        ├── UploadScreen
        │   ├── UploadPanel         # Video + SRT upload (chunked, 5MB chunks)
        │   └── PipelineConfig      # Pipeline parameter controls
        ├── PipelineMonitor
        │   ├── StepList
        │   │   └── StepItem[]      # Per-step status indicators
        │   ├── LogViewer           # Step log viewer
        │   ├── TrainingCharts      # PSNR/loss Recharts line charts
        │   ├── ValidationReport    # COLMAP validation display
        │   └── SparseCloudViewer   # R3F 3D point cloud + camera frustums
        │       └── CameraFrustum   # R3F camera wireframe
        ├── QAReview
        │   ├── SceneRenderer       # Spark Gaussian Splat viewer
        │   └── FloorPlaneAdjuster  # Y-offset + rotation sliders
        └── SettingsScreen          # Pipeline defaults + theme toggle
```

### State Management

- **No global state library** (no Redux, Zustand, or Context providers)
- All state is **local component state** (`useState`) or **custom hooks**:
  - `useScenes()` — fetches scene list, provides `refreshScenes()`
  - `usePipelineStatus(sceneId)` — polls `/api/pipeline/status/:id` every 2s
  - `useTrainingMetrics(sceneId)` — fetches training metrics once
- **WebSocket hook** (`api/ws.ts`): `useWebSocket(sceneId)` — connects to `/api/ws/:id`, dispatches `onStatus`, `onMetric`, `onLog`, `onWarning`, `onGpu` callbacks

### Spark/Three.js/R3F Integration

See [Section 7: Renderer Analysis](#7-renderer-analysis) for detailed breakdown.

### CSS/Styling Approach

- **Plain CSS files** — one `.css` per component (BEM-like naming convention)
- **CSS custom properties** defined in `index.css` for theming (dark/light mode)
- **No CSS modules, Tailwind, or styled-components**
- Theme toggle in `SettingsScreen` adds/removes `.dark` class on `<html>`

### Asset Loading

- SPZ files fetched via URL: `/scenes/{scene_id}/output/scene.spz`
- Alignment JSON fetched via URL: `/scenes/{scene_id}/output/alignment.json`
- Both served as static files by FastAPI (`app.mount("/scenes", StaticFiles(...))`)
- No asset bundling or pre-loading strategy

### Build-Time Config

- No `.env` files in the client
- `API_BASE` is hardcoded in `utils/constants.ts` as `/api`
- Vite proxy handles routing to backend in dev mode

---

## 4. Backend Architecture

### API Routes

#### Health (`server/routes/health.py`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Returns `{status: "ok", version: "0.1.0"}` |

#### Scenes (`server/routes/scenes.py`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scenes` | List all scenes with latest pipeline status |
| POST | `/api/scenes` | Create a scene (validates `SceneCreate` body) |
| GET | `/api/scene/{id}/config` | Get scene config (SceneConfig) |
| PUT | `/api/scene/{id}/config` | Update scene config |
| PUT | `/api/scene/{id}/alignment` | Update alignment (runs `align_scene.py`) |
| GET | `/api/scene/{id}/cameras` | Get COLMAP camera positions |
| GET | `/api/scene/{id}/sparse_cloud` | Get sparse point cloud + cameras |
| GET | `/api/scene/{id}/metadata` | Get video/SRT metadata |
| DELETE | `/api/scenes/{id}` | Delete scene + all data |
| DELETE | `/api/scene/{id}/video` | Delete raw video only |

#### Pipeline (`server/routes/pipeline.py`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/pipeline/start/{id}` | Start pipeline (rate-limited: 5/min) |
| POST | `/api/pipeline/resume/{id}/{step}` | Resume from step |
| POST | `/api/pipeline/cancel/{id}` | Cancel running pipeline |
| GET | `/api/pipeline/status/{id}` | Get current status from status.json |
| GET | `/api/pipeline/logs/{id}/{step}` | Get step log file contents |
| GET | `/api/pipeline/validation/{id}` | Get validation report JSON |
| GET | `/api/pipeline/metrics/{id}` | Get training metrics |
| GET | `/api/pipeline/runs/{id}` | Get latest pipeline run from DB |

#### Upload (`server/routes/upload.py`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload/chunk` | Chunked video upload (multipart form) |
| POST | `/api/upload/srt/{id}` | Upload DJI SRT sidecar file |
| DELETE | `/api/upload/srt/{id}` | Delete SRT file |

### WebSocket Endpoints

| Path | Protocol | Description |
|------|----------|-------------|
| `/api/ws/{scene_id}` | WS | Real-time pipeline updates |

**Message types** (server → client):
- `status` — Pipeline step status changes (from `status.json` polling)
- `metric` — Training metrics (PSNR, loss, iteration)
- `log` — Log line output
- `warning` — Anomaly alerts (NaN loss, CUDA OOM, loss spikes)
- `gpu` — GPU utilization stats (nvidia-smi polling every 30s)

### Job/Pipeline Management

- **SQLite** via aiosqlite (not jobs.json — compliant with CLAUDE.md constraint)
- Database: `vr_scout.db` (configurable via `VRS_DB_PATH` env var)
- **Schema** (3 tables):
  - `scenes` — id, name, created_at, updated_at, config (JSON), latest_run_id
  - `pipeline_runs` — id, scene_id, config (JSON), status, started_at, completed_at, validation_report (JSON)
  - `pipeline_steps` — id, run_id, step_number, step_name, status, started_at, completed_at, message, log_path
- WAL journal mode enabled for concurrent reads
- Foreign keys enforced

### File Upload Handling

- **Chunked uploads**: 5 MB default chunk size, 10 MB max per chunk, 10 GB max per file, 20 GB max per scene
- Server reassembles chunks into `raw/{scene_id}.mp4`
- **ffprobe validation** on final chunk: verifies the reassembled file is a valid video
- **Per-scene upload tracking**: in-memory dict tracks bytes received per scene
- **SRT sidecar upload**: separate endpoint, validated as text file with `.srt` extension
- Rate limiting: 1000 uploads/min via `SlidingWindowRateLimiter`

### Pipeline Invocation

- `pipeline_service.py` uses `asyncio.create_subprocess_exec` (never `shell=True` — compliant)
- **WSL-aware**: On Windows, wraps command with `wsl -d Ubuntu-22.04 -- bash -ic "conda activate splat && ..."`
- Converts Windows paths to WSL paths (`/mnt/c/...`)
- Tracks running processes by scene_id in `_running_processes` dict
- Cancel: SIGTERM → 5s wait → SIGKILL
- Hang detection: per-step warn threshold (20 min default) and kill threshold (40 min)
- Resume: starts process.sh with `--resume-from <step>` flag

### Security

- **Scene ID validation**: regex `^[a-zA-Z0-9_-]{1,64}$` — prevents path traversal via scene names
- **Path sanitization**: `sanitize_path()` strips `..`, `/`, `\`, null bytes, then verifies resolved path stays within base directory
- **Rate limiting**: `SlidingWindowRateLimiter` — sliding window, in-memory, per-key tracking
  - Upload: 1000 req/min
  - Pipeline: 5 req/min
  - General: 60 req/min
- **Input validation**: Pydantic v2 models with field constraints
- **CORS**: restricted to `http://localhost:3000` by default

**Security Issues Observed**:
1. Rate limiter keys use `"global"` string, not per-IP — rate limits are shared across all clients
2. No authentication/authorization — anyone on the network can access all endpoints
3. `sanitize_path` strips `..` before resolving — could miss edge cases with percent-encoded or unicode normalization attacks (though Python's `Path.resolve()` provides secondary defense)
4. Static file serving of entire `scenes/` directory gives access to all scene data including COLMAP databases

---

## 5. Pipeline Scripts

### `scripts/process.sh` (648 lines) — Main Orchestrator

**Steps**:
1. Pre-flight checks (CUDA, colmap, 3dgsconverter, gsplat, disk space)
2. Frame extraction (`ffmpeg` with scene change detection)
3. Metadata extraction (`extract_metadata.py`)
4. COLMAP feature extraction + matching
5. COLMAP mapping (sparse reconstruction)
6. Gravity alignment (3 strategies: geo_registration → gimbal_gravity → manhattan)
7. COLMAP validation (`validate_colmap.py`)
8. gsplat MCMC training → checkpoint → PLY export
9. PLY → SPZ conversion (`3dgsconverter`)
10. Default `alignment.json` generation

**External tools called**: ffmpeg, colmap, python (gsplat simple_trainer.py, validate_colmap.py, align_scene.py, ckpt_to_ply.py, 3dgsconverter), tee

**Hardcoded paths/values**:
- `CUDA_HOME` must be set (checked in pre-flight)
- gsplat invocation: `python examples/simple_trainer.py` (from `GSPLAT_DIR`)
- Default camera model: `SIMPLE_RADIAL`
- Default matcher: `exhaustive`
- Default training iterations: 30000
- `--single_camera 1` always passed to COLMAP (per CLAUDE.md)
- Resume capability via `--resume-from <step>` flag
- Status tracking: writes `status.json` after each step transition

**Error handling**: Each step checks exit codes; failures write status.json with `failed` status and abort. Pre-flight errors are aggregated and reported.

### `scripts/validate_colmap.py` (429 lines)

- Reads COLMAP binary files (cameras.bin, images.bin, points3D.bin)
- Validates 11 camera models
- Calculates: registration rate, reprojection error, point counts, per-image stats
- Enriches with telemetry data (metadata.json, gravity_validation.json) if available
- Exit codes: 0 = pass, 1 = warning (50-89%), 2 = blocked (<50%)
- Outputs `validation_report.json`

### `scripts/align_scene.py` (159 lines)

- Applies Y-axis offset (meters) and Y-axis rotation (degrees)
- Stores 4x4 column-major matrix (Three.js compatible)
- Matrix multiplication: Final = Rotation * Translation * Current

### `scripts/ckpt_to_ply.py` (117 lines)

- Converts gsplat `.pt` checkpoint → standard Gaussian Splatting PLY
- Extracts means, quats, scales, opacities, SH coefficients
- Writes binary PLY with 16-element properties per vertex

### `scripts/compare_runs.py` (280 lines)

- Compares metrics between two gsplat training runs
- Parses PSNR, SSIM, LPIPS, Gaussian count, training time
- Falls back to log parsing if JSON metrics unavailable

### `scripts/extract_metadata.py` (197 lines)

- Uses `server.utils.metadata_extractor` for ffprobe + SRT parsing
- Generates `frame_metadata.json` with per-frame telemetry
- Determines alignment strategy (geo_registration > gimbal_gravity > manhattan)
- Always exits 0 (non-blocking)

### `scripts/generate_geo_reference.py` (69 lines)

- Converts GPS coordinates to local ENU (East-North-Up)
- Writes COLMAP-compatible geo-reference text file
- Returns 0 on success, 1 if no GPS data

### `scripts/validate_gravity.py` (234 lines)

- Compares gimbal-derived gravity against COLMAP alignment gravity
- Agreement levels: agree (<10 deg), marginal (10-30 deg), disagree (>30 deg)
- Always exits 0 (informational only)

### `scripts/bootstrap.sh` (107 lines)

- Idempotent environment setup
- Checks for conda env and `CUDA_HOME`
- Clones gsplat, installs Python/Node deps
- Creates directory structure

---

## 6. Scene Data Audit

### Scene: `library_area` (2.0 GB)

| File/Dir | Size | Description |
|----------|------|-------------|
| `db.db` | 808.5 MB | COLMAP feature database |
| `frames/` | ~476 JPG files | Extracted video frames |
| `sparse/` | — | Pre-alignment COLMAP models |
| `aligned/cameras.bin` | 96 B | Aligned camera parameters |
| `aligned/images.bin` | 120.5 MB | Aligned image metadata |
| `aligned/points3D.bin` | 10.4 MB | Aligned 3D points |
| `output/point_cloud.ply` | 55.3 MB | Trained Gaussian Splat PLY |
| `output/scene.spz` | 2.5 MB | Compressed SPZ for viewer |
| `output/alignment.json` | ~100 B | Identity transform |
| `output/cfg.yml` | ~1 KB | gsplat training config |
| `logs/` | 8 log files | Per-step pipeline logs |
| `status.json` | ~200 B | **STALE** — shows step 5 "running" |
| `validation_report.json` | ~2 KB | Pass: 96.01% registration |
| `training_metrics.log` | 358 KB | Training loss/PSNR curves |
| `raw/library_area.mp4` | — | Original video file |

**Validation Report Summary**:
- Registration rate: 96.01% (457/476 frames)
- Mean reprojection error: 1.19 px (high — design plan targets <1.0)
- 3D points: 118,059
- Camera model: OPENCV
- Scene scale: 64.71 meters
- Gravity alignment: identity transform (alignment may have failed)
- 19 unregistered frames (mostly early sequence)

**Issue**: `status.json` is stale — shows step 5 "gravity_alignment" as "running" with timestamp `2026-03-16T02:28:48Z`, but all output files exist through step 9 (conversion). This indicates the status file was not updated properly after step 5 completed.

### Scene: `outdoor_rooftop` (71 MB)

| File/Dir | Size | Description |
|----------|------|-------------|
| `output/scene.spz` | 70.4 MB | Large SPZ (migrated from v2) |
| `output/alignment.json` | ~100 B | Identity transform, "migrated from v2" |

- **No intermediate data**: No db.db, no frames, no sparse, no logs, no status.json
- **Migrated from v2**: alignment.json source field says "migrated from v2"
- **SPZ is 28x larger** than library_area (70.4 MB vs 2.5 MB) — likely higher Gaussian count or lower compression

### `indoor_library` — DOES NOT EXIST

The BUILD_PLAN.md (PR-1) mentions resolving scene ambiguity between `indoor_library` and `library_area`. **`indoor_library` does not exist** in the repository. Only `library_area` exists. This pre-requisite appears to be resolved (or was never an issue).

### Raw Video Files

`raw/library_area.mp4` is a **broken symlink** pointing to `scenes/scene_1773578764403/raw/scene_1773578764403.mp4` — a scene ID that doesn't match any existing scene directory. The actual video is at `scenes/library_area/raw/library_area.mp4`.

---

## 7. Renderer Analysis

### Core File: `client/src/components/viewer/SceneRenderer.tsx` (319 lines)

#### Spark Version & Import
```typescript
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';
// Package version: ^0.1.10 (from package.json)
```

#### Scene Loading
1. `SparkRenderer` initialized once with the WebGL2 renderer from R3F
2. `SplatMesh` created with `{ url: spzUrl }` — fetches SPZ from server
3. On `mesh.initialized` promise resolution, fetches `alignmentUrl` for transform
4. If mobile: `maxSplats` budget applied (default 300K)

#### Coordinate System
- SPZ format assumed to be in RUB coordinate system (per CLAUDE.md)
- No explicit coordinate system conversion in the renderer
- Alignment transform applied directly to mesh matrix as column-major 4x4

#### Alignment Handling
```typescript
const alignment = await resp.json() as { transform?: number[] };
if (alignment.transform) {
  mesh.matrix.fromArray(alignment.transform);
  mesh.matrixAutoUpdate = false;
}
```
- `alignment.json` contains a 16-float column-major 4x4 matrix
- Applied to `SplatMesh.matrix` directly
- If fetch fails (404), identity is used silently

#### Performance Settings
- `maxStdDev`: configurable via SceneConfig, defaults to `Math.sqrt(5)` (~2.236)
- `premultipliedAlpha: true`
- `antialias: false` on Canvas
- `toneMapping: THREE.NoToneMapping`
- `outputColorSpace: THREE.LinearSRGBColorSpace`
- DPR: mobile = 1, desktop = min(devicePixelRatio, 2)
- FPS measured via `useFrame` in `FPSMeasure` component

#### VR-Specific Code
```typescript
// vrEnabled will be used when VR button is wired up
void vrEnabled;
```
**VR is NOT implemented.** The `enableVR` prop exists in `ViewerProps` but is explicitly voided in the renderer. No `VRButton`, no `SparkXr`, no XR session management exists.

#### Camera Setup
- `OrbitControls` from Three.js (not @react-three/drei)
- Default camera: position `[0, 1.6, 5]`, FOV 60
- Damping enabled, factor 0.1

#### Floor Grid
- Optional `<gridHelper>` rendered as a Three.js R3F element
- Adjustable via `floorYOffset` and `floorYRotation` props

### Standalone Viewer (`client/src/viewer/standalone.tsx`)

- Separate Vite entry point at `src/viewer/standalone.html`
- Reads scene URL from `?url=` query parameter
- Renders `SceneRenderer` in isolation (no sidebar, no API)
- Hardcoded `SceneConfig` with the URL parameter

---

## 8. Configuration & Environment

### Environment Variables

| Variable | Prefix | Default | Used In |
|----------|--------|---------|---------|
| `VRS_APP_VERSION` | VRS_ | "0.1.0" | `server/config.py` |
| `VRS_DB_PATH` | VRS_ | "vr_scout.db" | `server/config.py` |
| `VRS_SCENES_DIR` | VRS_ | "scenes" | `server/config.py` |
| `VRS_RAW_DIR` | VRS_ | "raw" | `server/config.py` |
| `VRS_SCRIPTS_DIR` | VRS_ | "scripts" | `server/config.py` |
| `VRS_CORS_ORIGINS` | VRS_ | ["http://localhost:3000"] | `server/config.py` |
| `CUDA_HOME` | — | (required) | `scripts/process.sh`, `scripts/bootstrap.sh` |

### CUDA/Conda Setup

- Conda environment: `splat` (Python 3.11 on WSL Ubuntu 22.04)
- `CUDA_HOME=/usr/local/cuda-11.8` set via conda activate.d script
- GPU: NVIDIA GeForce RTX 4070 Laptop (8 GB VRAM, Compute 8.9)

### No .env Files

No `.env` file exists in the repository. All configuration is via environment variables or hardcoded defaults.

### WSL-Specific Paths

- Windows project path: `C:\Users\aaron\Desktop\vr-scout-v3`
- WSL project path: `/mnt/c/Users/aaron/Desktop/vr-scout-v3`
- `pipeline_service.py` handles Windows↔WSL path conversion

### Dev Server Configuration (`.claude/launch.json`)

| Name | Command | Port |
|------|---------|------|
| `api-server-wsl` | `wsl -d Ubuntu-22.04 -- bash -ic "conda activate splat && ... uvicorn ... --port 8002"` | 8002 |
| `api-server` | `python -m uvicorn server.main:app --port 8001` | 8001 |
| `client` | `cmd /c "cd client && npx vite --port 3000"` | 3000 |

**Note**: Vite proxy in `vite.config.ts` targets port 8002 (WSL server), matching `api-server-wsl`.

---

## 9. Known Issues & Gaps

### Dead Code / Unused Files

| Item | Location | Issue |
|------|----------|-------|
| `App.css` | `client/src/App.css` | Not imported anywhere; contains `.hero` class referencing `hero.png` |
| `hero.png` | `client/src/assets/hero.png` | Only referenced in dead `App.css` |
| `react.svg` | `client/src/assets/react.svg` | Vite template leftover, never imported |
| `vite.svg` | `client/src/assets/vite.svg` | Vite template leftover, never imported |
| `db.sqlite` | `server/db.sqlite` | Empty 0-byte file, not used (DB is `vr_scout.db`) |
| `enableVR` prop | `SceneRenderer.tsx:286` | Explicitly voided: `void vrEnabled` |
| `onProgress` prop | `SceneRenderer.tsx:284` | Explicitly voided — Spark 0.1.10 doesn't expose download progress |

### Missing Error Handling

| Area | Issue |
|------|-------|
| `status.json` staleness | `library_area/status.json` stuck at step 5 "running" despite pipeline completing through step 9 |
| DB connection leak potential | `get_db()` opens new connections for non-`:memory:` paths; `_close_if_not_shared()` relies on callers in finally blocks |
| WebSocket reconnection | `ws.ts` has reconnect logic but no exponential backoff ceiling |

### Security Vulnerabilities

| Issue | Severity | Location |
|-------|----------|----------|
| No authentication | High | All endpoints publicly accessible |
| Global rate limit keys | Medium | `security.py:99-101` — uses `"global"` key, not per-IP |
| Static file exposure | Medium | `main.py:59` — entire `scenes/` dir served, includes COLMAP DBs |
| CORS localhost-only | Low | Not a vulnerability, but blocks legitimate LAN access |

### Incomplete Features

| Feature | Status | Evidence |
|---------|--------|----------|
| WebXR/VR support | **Stubbed** | `enableVR` prop exists but voided; no VR session code |
| Download progress | **Stubbed** | `onProgress` prop exists but voided (Spark limitation) |
| LOD rendering | **Stubbed** | `lodEnabled` field in SceneConfig, never used |
| A/B test comparison UI | **Missing** | `compare_runs.py` exists but no UI triggers it |
| Pipeline resume UI | **Partial** | API exists, button not visible in PipelineMonitor |
| Ruff/mypy config files | **Missing** | Caches exist but no `ruff.toml` or `pyproject.toml` |

### Design Plan vs Reality — Inconsistencies

| Design Plan Says | Reality |
|------------------|---------|
| "SQLite for job management — never jobs.json" | **Compliant** — uses aiosqlite |
| "SPZ is the only output format" | **Compliant** — PLY preserved alongside SPZ per plan |
| "gsplat: `python examples/simple_trainer.py`" | **Compliant** |
| "Use 3dgsconverter for PLY→SPZ" | **Compliant** |
| "Always `--single_camera 1`" | **Compliant** — set in process.sh |
| "Never `create_subprocess_shell` or `shell=True`" | **Compliant** — uses `create_subprocess_exec` |
| "Viewer must never import from pipeline/upload/dashboard/api" | **Compliant** — SceneRenderer.tsx only imports from types, viewer, and three |
| 5 screens: Dashboard, Upload, Pipeline, QA Review, Settings | **Compliant** — all 5 implemented |
| WebSocket for real-time updates | **Compliant** — status, metrics, logs, warnings, GPU |
| Quest 3 / WebXR VR support | **NOT IMPLEMENTED** — VR prop is voided |
| Performance budgets (1M desktop, 500K-800K Quest 3, 300K mobile) | **Partial** — mobile 300K cap implemented, others not enforced |
| Recharts for training metrics | **Compliant** |
| Dark/light theme | **Compliant** — CSS custom properties + toggle |
| 10-step pipeline | **Compliant** — process.sh implements all 10 steps |
| Validation gates (50% blocked, 50-89% warning, 90%+ pass) | **Compliant** — validate_colmap.py implements these thresholds |
| Hang detection (warn/kill thresholds) | **Compliant** — pipeline_service.py implements per-step thresholds |
| GPU monitoring | **Compliant** — nvidia-smi polling via gpu_poller.py |
| Anomaly detection (NaN loss, CUDA OOM, loss spikes, PSNR plateaus) | **Compliant** — metrics_parser.py detects these |
| Chunked upload | **Compliant** — 5 MB chunks with retry |
| DJI SRT telemetry | **Compliant** — upload endpoint + parsing |
| Geo-registration / gravity alignment | **Compliant** — 3 strategies implemented |
| Sparse cloud visualization | **Compliant** — SparseCloudViewer with R3F |

### Features in Code Not in Design Plan (Undocumented)

| Feature | Files |
|---------|-------|
| ConfirmDialog component | `client/src/components/layout/ConfirmDialog.tsx` |
| Scene deletion (DB + files) | `server/routes/scenes.py`, `server/db.py` |
| Video deletion (free space) | `server/routes/scenes.py` |
| SceneNav component | `client/src/components/layout/SceneNav.tsx` |
| `ckpt_to_ply.py` script | `scripts/ckpt_to_ply.py` |
| `extract_metadata.py` script | `scripts/extract_metadata.py` |
| `generate_geo_reference.py` | `scripts/generate_geo_reference.py` |
| `validate_gravity.py` | `scripts/validate_gravity.py` |
| Server-side COLMAP binary reader | `server/utils/colmap_reader.py` |
| Geo utilities (GPS→ENU) | `server/utils/geo_utils.py` |
| Metadata extractor service | `server/utils/metadata_extractor.py` |

### Missing Tests

- No frontend tests whatsoever (no vitest, jest, or testing-library configured)
- Backend tests exist but coverage is limited:
  - `test_health.py` — 1 test
  - `test_scenes.py` — 5 tests (CRUD + path traversal)
  - `test_security.py` — comprehensive (path traversal, input validation, rate limiting)
  - `test_services.py` — anomaly detection, GPU poller mock, hang detection
  - `test_upload.py` — chunked upload assembly, error cases
  - **No tests for**: pipeline start/cancel/resume, WebSocket functionality, sparse cloud API, alignment updates, metadata extraction

---

## 10. Feature Inventory

| Feature | Status | File(s) | Notes |
|---------|--------|---------|-------|
| Scene Dashboard | Working | `SceneDashboard.tsx`, `SceneCard.tsx` | Lists scenes with status badges |
| Scene Create | Working | `UploadPanel.tsx`, `routes/scenes.py` | Auto-creates on first upload |
| Scene Delete | Working | `SceneCard.tsx`, `Sidebar.tsx`, `routes/scenes.py` | With confirmation dialog |
| Video Upload (chunked) | Working | `UploadPanel.tsx`, `routes/upload.py` | 5 MB chunks, retry, progress bar |
| SRT Upload | Working | `UploadPanel.tsx`, `routes/upload.py` | DJI SRT telemetry sidecar |
| Video Delete | Working | `routes/scenes.py` | Frees disk space |
| Pipeline Config UI | Working | `PipelineConfig.tsx` | Camera model, matcher, iterations, SH, etc. |
| Pipeline Start | Working | `PipelineMonitor.tsx`, `routes/pipeline.py` | WSL subprocess execution |
| Pipeline Cancel | Working | `PipelineMonitor.tsx`, `routes/pipeline.py` | SIGTERM → SIGKILL |
| Pipeline Resume | Partial | `routes/pipeline.py`, `process.sh` | API exists, no UI button visible |
| Pipeline Status | Working | `PipelineMonitor.tsx`, `status_watcher.py` | Real-time via WebSocket |
| Step List | Working | `StepList.tsx`, `StepItem.tsx` | Visual step progress |
| Log Viewer | Working | `LogViewer.tsx`, `routes/pipeline.py` | Per-step log display |
| Training Charts | Working | `TrainingCharts.tsx` | PSNR + loss via Recharts |
| Validation Report | Working | `ValidationReport.tsx` | COLMAP quality metrics |
| Sparse Cloud Viewer | Working | `SparseCloudViewer.tsx`, `CameraFrustum.tsx` | R3F 3D visualization |
| Scene Renderer (Spark) | Working | `SceneRenderer.tsx` | Gaussian Splat WebGL2 viewer |
| Alignment Adjustment | Working | `FloorPlaneAdjuster.tsx`, `routes/scenes.py` | Y-offset + rotation sliders |
| QA Review Screen | Working | `QAReview.tsx` | Viewer + alignment tools |
| Settings Screen | Working | `SettingsScreen.tsx` | Pipeline defaults + theme toggle |
| Standalone Viewer | Working | `standalone.tsx`, `standalone.html` | URL-based SPZ loading |
| FPS Counter | Working | `FPSCounter.tsx` | Overlay display |
| Floor Grid | Working | `SceneRenderer.tsx` | Optional reference grid |
| Mobile Budget Cap | Working | `SceneRenderer.tsx:271` | 300K Gaussians on mobile |
| WebSocket Updates | Working | `ws.ts`, `ws/manager.py` | Status, metrics, logs, warnings, GPU |
| GPU Monitoring | Working | `gpu_poller.py` | nvidia-smi every 30s |
| Anomaly Detection | Working | `metrics_parser.py` | NaN, OOM, spikes, stalls |
| Hang Detection | Working | `pipeline_service.py` | Per-step thresholds |
| Rate Limiting | Working | `security.py` | Upload, pipeline, general |
| Path Traversal Protection | Working | `security.py` | Sanitize + validate |
| Scene ID Validation | Working | `security.py` | Regex whitelist |
| Dark/Light Theme | Working | `index.css`, `SettingsScreen.tsx` | CSS custom properties |
| WebXR/VR Mode | Stubbed | `SceneRenderer.tsx` | Prop exists, implementation voided |
| LOD Rendering | Stubbed | `scene.ts` | SceneConfig field, not implemented |
| Download Progress | Stubbed | `scene.ts`, `SceneRenderer.tsx` | Spark 0.1.10 limitation |
| A/B Comparison UI | Missing | `compare_runs.py` (CLI only) | Script exists, no UI |
| Authentication | Missing | — | No auth on any endpoint |
| CI/CD | Missing | — | No GitHub Actions or similar |
| Docker | Missing | — | No Dockerfile |
| Frontend Tests | Missing | — | No test framework configured |

---

## 11. Development Timeline

### Overview

- **Date range**: 2026-03-15 to 2026-03-16 (2 calendar days)
- **Total commits**: 19
- **Lines added**: ~12,000+ (estimated from diffs)

### Timeline

| Date | Commits | Milestone |
|------|---------|-----------|
| 2026-03-15 | 1 | **Phase 0**: Environment setup, design plan, build plan, SETUP.md |
| 2026-03-15 | 1 | **Phase 3 Bootstrap**: Project structure, deps, shared types (4,417 lines) |
| 2026-03-15 | 1 | **Phase 3A**: Pipeline scripts — process.sh, validate_colmap.py, align_scene.py, compare_runs.py, bootstrap.sh (1,336 lines) |
| 2026-03-15 | 1 | **Phase 3B**: FastAPI server — models, db, routes, ws, services, tests (1,594 lines) |
| 2026-03-15 | 1 | **Phase 3C**: React client — 5 screens, API client, WebSocket hook, layout, routing (3,293 lines) |
| 2026-03-15 | 1 | **Phase 4A**: Server integration — status watcher, metrics parser, hang detection, GPU stats (846 lines) |
| 2026-03-15 | 1 | **Phase 4B**: Client integration — API wiring, WebSocket, upload, pipeline controls |
| 2026-03-15 | 1 | **Phase 5**: Viewer integration — Spark SplatMesh, R3F Canvas, floor grid, FPS counter (427 lines) |
| 2026-03-15 | 1 | **Phase 6**: Security hardening — path traversal, upload limits, rate limiting (587 lines) |
| 2026-03-15 | 1 | **Phase 7**: Viewer extraction — standalone page, mobile optimization |
| 2026-03-15 | 1 | **WSL/Windows Fix**: Path integration for pipeline execution |
| 2026-03-15 | 1 | **Code Audit Fixes**: Type contracts, error handling, missing __init__.py |
| 2026-03-15 | 4 | **Bug Fix Sprint**: Upload field mismatch, create-before-upload, Pipeline Monitor UX, error handling |
| 2026-03-15→16 | 2 | **Pipeline Debugging**: Script path resolution, WSL integration, pipe deadlock |
| 2026-03-16 | 1 | **End-to-End Fix**: Proxy port, validation, training, conversion (9 files, 238+/31-) |

### Notable Large Commits

| Commit | Files | Description |
|--------|-------|-------------|
| `72d63d4` | 23 files (+4,417) | Phase 3 Bootstrap — entire project scaffolding |
| `f438615` | 47 files (+3,293) | Phase 3C — full React client with all 5 screens |
| `7fdfd17` | 24 files (+1,594) | Phase 3B — complete FastAPI server |
| `98ab38b` | 5 files (+1,336) | Phase 3A — all pipeline scripts |
| `8924154` | 7 files (+846) | Phase 4A — server integration services |
| `fe599f7` | 10 files (+587) | Phase 6 — security hardening |
| `d435838` | 7 files (+427) | Phase 5 — Spark viewer integration |
| `49d28a0` | 15 files (+367) | Pipeline Monitor UX overhaul |

### Observations

- Entire project was built in ~2 days (2026-03-15 to 2026-03-16)
- Phased approach matches BUILD_PLAN.md structure (Phases 0→3→4→5→6→7)
- Phases 1, 2, and 8 from BUILD_PLAN.md are not represented in commits (possibly deferred or N/A)
- 8 bug-fix commits after initial build phases indicate rapid iteration / integration testing
- No gaps between phases — continuous development
- Pipeline was successfully run (library_area has complete output through SPZ conversion)

---

*End of audit. All claims are verified by reading actual source files. Items marked as "missing" or "not implemented" were confirmed by searching the entire codebase.*
