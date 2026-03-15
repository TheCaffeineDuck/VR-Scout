# VR Scout v3 — Agent-Executable Build Plan

**For use with Claude Code Team Agents & Worktree**
*Restructured from VrScout_v3_design_plan.md — March 2026*

---

## How to Read This Document

This plan is written for an AI coding agent (Claude Code). Every task has:

- **Inputs**: files/artifacts that must exist before the task starts
- **Outputs**: files the task must produce
- **Acceptance criteria**: concrete, testable conditions (not subjective)
- **Agent scope**: which files the agent may create/modify (prevents merge conflicts in parallel worktrees)

Phases are sequential. Tasks within a phase may be parallel (marked with `PARALLEL`).

---

## Pre-Requisites (Owner-Executed)

These steps require physical hardware or human judgment. The owner (Aaron) must complete them and commit the results before agent work begins.

### PR-1: Resolve Scene Ambiguity

**Action:** On the MSI laptop (WSL), compare `scenes/indoor_library/` and `scenes/library_area/` directories. Check creation dates, frame counts, COLMAP database image paths. Consolidate into a single canonical scene directory. Delete or rename the duplicate.

**Commit artifact:** A note in `SETUP.md` documenting which directory is canonical and what was done with the other.

### PR-2: Environment Verification

**Action:** Run on WSL:

```bash
conda activate splat
echo "CUDA_HOME=$CUDA_HOME"
nvidia-smi
colmap help | head -20
python -c "import gsplat; print(gsplat.__version__)"
pip freeze > requirements.txt
ls tools/gsplat/examples/simple_trainer.py
```

**Commit artifacts:**
- `SETUP.md` with output of the above commands
- `requirements.txt` with pinned Python versions
- Confirmation of COLMAP subcommands available (especially whether global mapper exists)

### PR-3: Quest 3 Thesis Validation (Phase 1)

**Action:** Load existing SPZ files in Spark 0.1.10 viewer on Quest 3 standalone browser. Measure FPS, document visual artifacts, confirm 72 FPS is achievable at ~500K Gaussians.

**Commit artifact:** `docs/quest3_validation.md` with FPS measurements, screenshots, pass/fail determination.

**Decision gate:** If Quest 3 cannot render at 72 FPS, the build plan pauses until the constraint is resolved.

### PR-4: Spark 2.0 Evaluation

**Action:** Install Spark 2.0-preview in a test branch. Load same SPZ files. Evaluate against these binary criteria:

1. Can `SparkXr` enter immersive-vr on Quest Browser? (yes/no)
2. Does LOD octree reduce peak GPU memory below 50MB for a 1M Gaussian scene? (yes/no)
3. FPS on Quest 3 >= 72 at 500K Gaussians? (yes/no)
4. Can SPZ files load directly without SOG conversion? (yes/no)
5. Is npm package stable (no breaking changes in last 3 releases)? (yes/no)

**Commit artifact:** `docs/spark2_evaluation.md` with yes/no for each criterion.

**Decision outcome:**
- All 1–4 pass → use Spark 2.0. Set `SPARK_VERSION=2.0` in `SETUP.md`.
- Any of 1–4 fail → use Spark 0.1.10. Set `SPARK_VERSION=0.1.10` in `SETUP.md`.

### PR-5: A/B Test Pipeline Settings (Phase 2)

**Action:** Run the A/B test protocol from Section 13 of the design plan on actual footage using WSL + GPU. This requires COLMAP and gsplat training runs.

**Commit artifacts:**
- `docs/ab_test_results.md` with registration rates, reprojection errors, PSNR/SSIM comparisons
- `config/pipeline_defaults.json`:

```json
{
  "camera_model": "SIMPLE_RADIAL or OPENCV (winner)",
  "matcher": "exhaustive or sequential (winner)",
  "training_iterations": 30000,
  "sh_degree": 1,
  "data_factor": 1,
  "frame_fps": 2,
  "scene_change_threshold": 0.1,
  "spark_version": "0.1.10 or 2.0 (from PR-4)"
}
```

**Decision gate:** Settings are locked. No more "A/B test required" placeholders.

---

## Git Resources to Clone at Setup

Before any agent phase begins, the bootstrap script must fetch these:

```bash
#!/bin/bash
# scripts/bootstrap.sh — run once to fetch all git dependencies

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# gsplat — need the repo (not just pip) for examples/simple_trainer.py
if [ ! -d "$PROJECT_ROOT/tools/gsplat" ]; then
  git clone --depth 1 https://github.com/nerfstudio-project/gsplat.git "$PROJECT_ROOT/tools/gsplat"
fi

# Install Python dependencies
pip install gsplat --break-system-packages 2>/dev/null || pip install gsplat
pip install "git+https://github.com/francescofugazzi/3dgsconverter.git" --break-system-packages 2>/dev/null || pip install "git+https://github.com/francescofugazzi/3dgsconverter.git"

# Node dependencies (client)
cd "$PROJECT_ROOT/client"
npm install

# Node dependencies (root, if monorepo scripts exist)
cd "$PROJECT_ROOT"
[ -f package.json ] && npm install

echo "Bootstrap complete."
```

NPM packages to install in `client/package.json`:

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@react-three/fiber": "^9.0.0",
    "three": "^0.172.0",
    "@sparkjsdev/spark": "^0.1.10",
    "recharts": "^2.15.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/three": "^0.172.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

Python dependencies for `server/requirements.txt`:

```
fastapi>=0.115.0
uvicorn[standard]>=0.34.0
websockets>=14.0
aiosqlite>=0.20.0
python-multipart>=0.0.18
pydantic>=2.10.0
```

---

## Quality Gate Protocol

After every phase, the following checks run. If any fail, the phase is not complete.

### QG-1: TypeScript Compilation

```bash
cd client && npx tsc --noEmit
```

**Pass:** Zero errors. Zero warnings treated as errors.

### QG-2: ESLint

```bash
cd client && npx eslint src/ --ext .ts,.tsx --max-warnings 0
```

**Pass:** Zero errors, zero warnings.

### QG-3: Python Lint + Type Check

```bash
cd server && python -m ruff check . && python -m mypy . --ignore-missing-imports
```

**Pass:** Zero errors from ruff. Mypy passes (warnings acceptable for third-party stubs).

### QG-4: Build Check

```bash
cd client && npm run build
```

**Pass:** Vite build succeeds with zero errors. Output in `client/dist/`.

### QG-5: Server Startup Check

```bash
cd server && timeout 10 python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl -s http://localhost:8000/api/health | grep -q '"status":"ok"'
kill %1
```

**Pass:** Server starts, health endpoint returns `{"status": "ok"}`.

### QG-6: Visual Preview Check

Open the Vite dev server in Preview browser. Manually verify:
- Page loads without blank screen or console errors
- Navigation between screens works
- No layout overflow or broken styling

**Pass:** All three conditions met.

### QG-7: Integration Smoke Test (Phases 4+ only)

```bash
# Start both servers
cd server && uvicorn main:app --port 8000 &
cd client && npm run dev -- --port 3000 &
sleep 5

# Hit key endpoints
curl -s http://localhost:8000/api/scenes | python -m json.tool
curl -s http://localhost:8000/api/health | python -m json.tool

# Check WebSocket connection
python -c "
import asyncio, websockets
async def test():
    async with websockets.connect('ws://localhost:8000/api/ws/test') as ws:
        print('WebSocket connected')
asyncio.run(test())
"

kill %1 %2
```

**Pass:** All commands succeed without error.

---

## Phase 3 — Pipeline Scripts & Project Scaffold

**Goal:** Working pipeline orchestration + project directory structure + server skeleton + client skeleton.

**Prerequisite:** PR-1 through PR-5 complete. `SETUP.md`, `config/pipeline_defaults.json`, and `requirements.txt` committed.

### Dependency Graph

```
PARALLEL WORKTREES:
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  Agent A:            │  │  Agent B:            │  │  Agent C:            │
│  Pipeline Scripts    │  │  FastAPI Server       │  │  React Client        │
│  (branch: pipeline)  │  │  (branch: server)     │  │  (branch: client)    │
│                     │  │                      │  │                      │
│  scripts/           │  │  server/             │  │  client/             │
│  config/            │  │                      │  │                      │
└─────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘
          │                        │                          │
          └────────────────────────┴──────────────────────────┘
                                   │
                              MERGE TO MAIN
                                   │
                          QUALITY GATES QG-1..QG-6
```

---

### Task 3A: Pipeline Scripts (Agent A — branch: `pipeline`)

**Scope:** Only touches `scripts/`, `config/`

#### Task 3A-1: process.sh

**Output:** `scripts/process.sh`

Write the full pipeline orchestration script from Section 4 of the design plan. Key requirements:

- `set -uo pipefail` (NOT `-e` — capture exit codes per step)
- `write_status()` function writes JSON to `scenes/{id}/status.json`
- `run_step()` function captures stdout/stderr per step to `scenes/{id}/logs/step_{N}_{name}.log`
- Steps 0-9 as defined in the design plan pipeline flow
- `--resume-from N` flag for resuming from a specific step
- Read camera model and matcher from `config/pipeline_defaults.json`
- Frame count validation gate after Step 1 (block < 50, warn < 150)
- Multi-model COLMAP selection after Step 4 (select largest by images.bin size)
- Registration rate gate after Step 4 (block < 50%, warn < 90%)
- CUDA OOM and NaN detection after Step 7
- SPZ size validation after Step 8

**Acceptance criteria:**
- `bash -n scripts/process.sh` passes (syntax check)
- `shellcheck scripts/process.sh` passes with no errors (warnings acceptable for SC2086 on intentional word splitting)
- Script is executable (`chmod +x`)
- `--resume-from` flag is implemented and skips completed steps

#### Task 3A-2: validate_colmap.py

**Output:** `scripts/validate_colmap.py`

Python script that reads COLMAP sparse reconstruction and outputs a JSON validation report.

**Inputs (CLI args):**
- `--sparse_path`: path to aligned sparse reconstruction
- `--original_sparse_path`: path to pre-alignment sparse reconstruction
- `--image_path`: path to extracted frames
- `--output_json`: path to write validation report
- `--min_registration_rate`: float (default 0.9)

**Output JSON schema:**

```json
{
  "registration_rate": 0.977,
  "registered_images": 298,
  "total_images": 305,
  "mean_reprojection_error_px": 0.42,
  "point_count": 48201,
  "points_per_image": 161.7,
  "camera_model": "SIMPLE_RADIAL",
  "alignment_applied": true,
  "alignment_is_identity": false,
  "unregistered_images": ["frame_00047.jpg", "frame_00198.jpg"],
  "scene_scale_estimate_meters": 12.5,
  "warnings": [],
  "pass": true
}
```

**Exit codes:** 0 = all pass, 1 = warnings, 2 = blocked

**Acceptance criteria:**
- `python -m py_compile scripts/validate_colmap.py` succeeds
- `ruff check scripts/validate_colmap.py` passes
- Script has `--help` output via argparse
- Handles missing files gracefully (returns exit code 2 with error message, does not crash)

#### Task 3A-3: align_scene.py

**Output:** `scripts/align_scene.py`

Residual alignment tool. Takes current `alignment.json` + user adjustments and writes updated `alignment.json`.

**Inputs (CLI args):**
- `--input_alignment`: path to current alignment.json
- `--y_offset`: float (meters, default 0)
- `--y_rotation`: float (degrees, default 0)
- `--output`: path to write updated alignment.json

**Acceptance criteria:**
- Identity input + zero adjustments = identity output
- Y rotation of 90 degrees produces correct rotation matrix
- `ruff check` passes

#### Task 3A-4: compare_runs.py

**Output:** `scripts/compare_runs.py`

A/B test comparison script. Reads two gsplat output directories, compares metrics.

**Output:** Formatted table to stdout + optional JSON output.

**Acceptance criteria:**
- `ruff check` passes
- Handles missing metrics gracefully

#### Task 3A-5: Pipeline Defaults Config

**Output:** `config/pipeline_defaults.json`

Template with all configurable pipeline settings. Values come from PR-5 (A/B test results). If PR-5 is not yet complete, use these defaults:

```json
{
  "camera_model": "SIMPLE_RADIAL",
  "matcher": "exhaustive",
  "training_iterations": 30000,
  "sh_degree": 1,
  "data_factor": 1,
  "frame_fps": 2,
  "scene_change_threshold": 0.1,
  "min_opacity": 5,
  "sor_intensity": 3,
  "compression_level": 5,
  "spark_version": "0.1.10"
}
```

#### Task 3A-6: Bootstrap Script

**Output:** `scripts/bootstrap.sh`

Clones git repos, installs Python and Node dependencies. See "Git Resources to Clone" section above.

**Acceptance criteria:**
- `bash -n scripts/bootstrap.sh` passes
- Script is idempotent (running twice doesn't break anything)

#### Quality Gate for Agent A

```bash
bash -n scripts/process.sh
bash -n scripts/bootstrap.sh
shellcheck scripts/process.sh scripts/bootstrap.sh
python -m py_compile scripts/validate_colmap.py
python -m py_compile scripts/align_scene.py
python -m py_compile scripts/compare_runs.py
ruff check scripts/
```

---

### Task 3B: FastAPI Server Skeleton (Agent B — branch: `server`)

**Scope:** Only touches `server/`

#### Task 3B-1: Project Structure

Create the directory structure:

```
server/
├── main.py                  # FastAPI app, CORS, lifespan
├── config.py                # Settings via pydantic-settings
├── db.py                    # SQLite connection + schema init
├── models/
│   ├── __init__.py
│   ├── scene.py             # SceneConfig, SceneStatus pydantic models
│   ├── pipeline.py          # PipelineConfig, StepStatus models
│   └── ws.py                # WebSocket message models
├── routes/
│   ├── __init__.py
│   ├── health.py            # GET /api/health
│   ├── scenes.py            # Scene CRUD endpoints
│   ├── pipeline.py          # Pipeline control endpoints
│   └── upload.py            # Chunked upload endpoint
├── ws/
│   ├── __init__.py
│   └── manager.py           # WebSocket connection manager
├── services/
│   ├── __init__.py
│   ├── pipeline_service.py  # Pipeline orchestration (calls process.sh)
│   ├── status_watcher.py    # Watches status.json, pushes to WS
│   └── metrics_parser.py    # Parses training_metrics.log
├── requirements.txt
└── tests/
    ├── __init__.py
    ├── test_health.py
    ├── test_scenes.py
    └── test_upload.py
```

#### Task 3B-2: Core Models (Pydantic)

**Output:** `server/models/scene.py`, `server/models/pipeline.py`, `server/models/ws.py`

All models from Appendices B, C, D of the design plan:
- `SceneConfig` (id, name, spzUrl, alignmentUrl, gaussianCount, shDegree, coordinateSystem, maxStdDev, lodEnabled, mobileBudget)
- `StatusFile` (scene_id, current_step, step_name, status, message, timestamp, pid)
- `PipelineConfig` (all settings from pipeline_defaults.json)
- `WSMessage` union type (status, metric, log_line, warning, gpu)
- `TrainingMetric` (iteration, max_iterations, loss, psnr, gaussian_count, elapsed_seconds, eta_seconds)
- `ValidationReport` (full schema from validate_colmap.py output)

**Acceptance criteria:**
- All models validate with example data
- `mypy server/models/` passes

#### Task 3B-3: Database Layer

**Output:** `server/db.py`

SQLite database with schema:

```sql
CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    config JSON,
    latest_run_id TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,  -- ISO timestamp format
    scene_id TEXT NOT NULL REFERENCES scenes(id),
    config JSON NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    validation_report JSON,
    FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

CREATE TABLE IF NOT EXISTS pipeline_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    step_number INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    message TEXT,
    log_path TEXT,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
);
```

Uses `aiosqlite` for async access. Provides helper functions: `get_scene()`, `list_scenes()`, `create_scene()`, `update_scene()`, `create_run()`, `update_step()`.

**Acceptance criteria:**
- Database creates on first run
- All CRUD operations work
- `mypy server/db.py` passes

#### Task 3B-4: API Routes

**Output:** `server/routes/health.py`, `server/routes/scenes.py`, `server/routes/pipeline.py`, `server/routes/upload.py`

Endpoints from Section 10 of the design plan:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Returns `{"status": "ok", "version": "0.1.0"}` |
| GET | `/api/scenes` | List all scenes with latest status |
| GET | `/api/scene/{scene_id}/config` | Scene config for viewer |
| POST | `/api/upload/chunk` | Chunked file upload (5MB chunks) |
| POST | `/api/pipeline/start/{scene_id}` | Start pipeline with config |
| POST | `/api/pipeline/resume/{scene_id}/{step}` | Resume from step |
| POST | `/api/pipeline/cancel/{scene_id}` | Kill pipeline (SIGTERM) |
| GET | `/api/pipeline/status/{scene_id}` | Current status.json |
| GET | `/api/pipeline/logs/{scene_id}/{step}` | Log content (paginated) |
| GET | `/api/pipeline/validation/{scene_id}` | Validation report JSON |
| GET | `/api/pipeline/metrics/{scene_id}` | Training metrics |
| PUT | `/api/scene/{scene_id}/alignment` | Update alignment.json |
| GET | `/api/scene/{scene_id}/cameras` | COLMAP camera positions |

**Acceptance criteria:**
- All endpoints return correct status codes
- Validation errors return 422 with detail
- Upload endpoint handles chunk reassembly
- Pipeline start calls `process.sh` via `asyncio.create_subprocess_exec` (NOT `shell`)
- Path traversal protection on all file-serving endpoints

#### Task 3B-5: WebSocket Manager

**Output:** `server/ws/manager.py`

- Connection manager for `WS /api/ws/{scene_id}`
- Watches `scenes/{id}/status.json` for changes (poll every 1s or inotify)
- Tails `scenes/{id}/training_metrics.log` during training step
- Pushes structured JSON messages per the WSMessage schema
- Handles client disconnect gracefully
- Sends GPU stats every 30s via `nvidia-smi` subprocess

**Acceptance criteria:**
- Multiple clients can connect to same scene_id
- Client disconnect doesn't crash the manager
- Messages conform to WSMessage schema

#### Task 3B-6: Pipeline Service

**Output:** `server/services/pipeline_service.py`

- Starts `process.sh` via `asyncio.create_subprocess_exec`
- Tracks PIDs per scene_id
- Implements cancel (sends SIGTERM, waits 10s, then SIGKILL)
- Implements resume (calls process.sh with `--resume-from`)
- Hang detection: background task checks step durations against thresholds from Section 5.4

**Acceptance criteria:**
- Uses `create_subprocess_exec`, never `create_subprocess_shell`
- Cancel kills the process tree, not just the shell
- Resume reuses existing step outputs

#### Task 3B-7: Tests

**Output:** `server/tests/test_health.py`, `server/tests/test_scenes.py`, `server/tests/test_upload.py`

Use `httpx` + `pytest` with FastAPI's `TestClient`.

**Acceptance criteria:**
- `pytest server/tests/ -v` passes
- Tests cover: health endpoint, scene CRUD, chunk upload flow

#### Quality Gate for Agent B

```bash
cd server
python -m ruff check .
python -m mypy . --ignore-missing-imports
pytest tests/ -v
timeout 10 python -m uvicorn main:app --port 8000 &
sleep 3
curl -sf http://localhost:8000/api/health | python -m json.tool
kill %1
```

---

### Task 3C: React Client Scaffold (Agent C — branch: `client`)

**Scope:** Only touches `client/`

#### Task 3C-1: Vite + React + TypeScript Setup

**Output:** Full `client/` directory with Vite config, tsconfig, ESLint config, and base App.

```
client/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── eslint.config.js
├── .prettierrc
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css               # Tailwind or vanilla CSS reset
    ├── types/
    │   ├── scene.ts            # SceneConfig, ViewerProps interfaces
    │   ├── pipeline.ts         # PipelineConfig, StepStatus, etc.
    │   └── ws.ts               # WSMessage types
    ├── api/
    │   ├── client.ts           # Fetch wrapper for all API calls
    │   └── ws.ts               # WebSocket hook with reconnect
    ├── hooks/
    │   ├── useScenes.ts        # Scene list data hook
    │   ├── usePipelineStatus.ts # WebSocket-backed pipeline status
    │   └── useTrainingMetrics.ts # Training metrics stream hook
    ├── components/
    │   ├── layout/
    │   │   ├── Sidebar.tsx
    │   │   └── MainContent.tsx
    │   ├── dashboard/
    │   │   ├── SceneDashboard.tsx    # Screen 1
    │   │   └── SceneCard.tsx
    │   ├── upload/
    │   │   ├── UploadPanel.tsx       # Screen 2 left
    │   │   └── PipelineConfig.tsx    # Screen 2 right
    │   ├── pipeline/
    │   │   ├── PipelineMonitor.tsx   # Screen 3
    │   │   ├── StepList.tsx
    │   │   ├── StepItem.tsx
    │   │   ├── TrainingCharts.tsx
    │   │   ├── ValidationReport.tsx
    │   │   └── LogViewer.tsx
    │   ├── qa/
    │   │   ├── QAReview.tsx          # Screen 4
    │   │   ├── FloorPlaneAdjuster.tsx
    │   │   └── CameraPathViewer.tsx
    │   ├── settings/
    │   │   └── SettingsScreen.tsx    # Screen 5
    │   └── viewer/
    │       ├── SceneRenderer.tsx     # Core viewer (extractable)
    │       ├── ViewerControls.tsx
    │       └── FPSCounter.tsx
    └── utils/
        ├── format.ts           # Number/date formatting
        └── constants.ts        # API URLs, defaults
```

**Vite config must include:**
- React plugin
- Proxy `/api` to `http://localhost:8000` in dev mode
- Proxy `/api/ws` to `ws://localhost:8000` in dev mode

**Acceptance criteria:**
- `npm run dev` starts without errors
- `npm run build` produces output in `dist/`
- `npx tsc --noEmit` passes
- `npx eslint src/ --max-warnings 0` passes

#### Task 3C-2: TypeScript Types (shared contracts)

**Output:** `client/src/types/scene.ts`, `client/src/types/pipeline.ts`, `client/src/types/ws.ts`

Must match server Pydantic models exactly:

```typescript
// scene.ts
export interface SceneConfig {
  id: string;
  name: string;
  spzUrl: string;
  alignmentUrl: string;
  gaussianCount: number;
  shDegree: 0 | 1 | 2 | 3;
  coordinateSystem: 'rub';
  maxStdDev?: number;
  lodEnabled?: boolean;
  mobileBudget?: number;
}

export interface ViewerProps {
  sceneConfig: SceneConfig;
  enableVR?: boolean;
  enableControls?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;
}

// pipeline.ts
export type PipelineStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'warning'
  | 'blocked'
  | 'awaiting_confirmation'
  | 'awaiting_review';

export interface StatusFile {
  scene_id: string;
  current_step: number;
  step_name: string;
  status: PipelineStatus;
  message: string;
  timestamp: string;
  pid: number;
}

export interface PipelineConfig {
  camera_model: 'SIMPLE_RADIAL' | 'OPENCV';
  matcher: 'exhaustive' | 'sequential';
  training_iterations: number;
  sh_degree: 0 | 1 | 2 | 3;
  data_factor: 1 | 2 | 4;
  frame_fps: 1 | 2 | 3;
  scene_change_threshold: number;
}

export interface ValidationReport {
  registration_rate: number;
  registered_images: number;
  total_images: number;
  mean_reprojection_error_px: number;
  point_count: number;
  camera_model: string;
  alignment_applied: boolean;
  alignment_is_identity: boolean;
  unregistered_images: string[];
  warnings: string[];
  pass: boolean;
}

// ws.ts
export interface TrainingMetric {
  iteration: number;
  max_iterations: number;
  loss: number;
  psnr: number;
  gaussian_count: number;
  elapsed_seconds: number;
  eta_seconds: number;
}

export type WSMessage =
  | { type: 'status'; data: StatusFile }
  | { type: 'metric'; data: TrainingMetric }
  | { type: 'log_line'; data: { step: number; line: string } }
  | { type: 'warning'; data: { message: string } }
  | { type: 'gpu'; data: { memory_used_mb: number; memory_total_mb: number; utilization_pct: number } };
```

#### Task 3C-3: API Client + WebSocket Hook

**Output:** `client/src/api/client.ts`, `client/src/api/ws.ts`

API client wraps `fetch` for all endpoints. WebSocket hook:
- Auto-reconnects on disconnect (5s interval)
- Parses incoming messages as `WSMessage`
- Exposes: `status`, `metrics[]`, `logLines[]`, `warnings[]`, `gpuStats`
- Cleans up on unmount

**Acceptance criteria:**
- TypeScript compiles cleanly
- WebSocket hook handles all WSMessage types

#### Task 3C-4: Layout Shell + Routing

**Output:** `client/src/App.tsx`, `client/src/components/layout/Sidebar.tsx`, `client/src/components/layout/MainContent.tsx`

SPA with react-router-dom v7. Routes:
- `/` → SceneDashboard
- `/scene/:id/upload` → UploadPanel + PipelineConfig
- `/scene/:id/pipeline` → PipelineMonitor
- `/scene/:id/review` → QAReview
- `/settings` → SettingsScreen

Sidebar shows scene list (from `useScenes` hook), "+ New Scene" button, Settings link, VR button.

**Acceptance criteria:**
- Navigation between all routes works
- Sidebar highlights current route
- Layout is responsive (sidebar collapses on small screens)

#### Task 3C-5: Scene Dashboard (Screen 1)

**Output:** `client/src/components/dashboard/SceneDashboard.tsx`, `client/src/components/dashboard/SceneCard.tsx`

Displays scene cards with latest pipeline status. Each card shows: name, last run date, status indicator, Gaussian count, file size, action buttons (View, Re-process, Export).

**Acceptance criteria:**
- Renders with mock data when server is not running
- Status indicators match all 7 PipelineStatus values
- "View" navigates to QAReview, "Re-process" navigates to Upload

#### Task 3C-6: Upload Panel (Screen 2)

**Output:** `client/src/components/upload/UploadPanel.tsx`, `client/src/components/upload/PipelineConfig.tsx`

Left panel: drag-and-drop zone, chunked upload with progress bar, file validation (type, size, duration).
Right panel: pipeline configuration form with all settings from design plan Section 6.3.

Chunked upload: 5MB chunks, POST to `/api/upload/chunk`, progress tracking, cancel support, retry on failure (3 attempts).

**Acceptance criteria:**
- File type validation rejects non-video files
- Progress bar updates per chunk
- Configuration form has all settings with correct defaults
- "Start Processing" button disabled until upload complete

#### Task 3C-7: Pipeline Monitor (Screen 3)

**Output:** `client/src/components/pipeline/PipelineMonitor.tsx` and sub-components

The most complex screen. Must include:
- Step list with status icons (from StepList/StepItem)
- Training charts (PSNR + Loss line charts via Recharts)
- Validation checkpoint panel (shows ValidationReport, Proceed/Re-run buttons)
- Error state expansion with suggestion and action buttons
- Log viewer (scrollable, last 200 lines, "Load More")
- Elapsed time and ETA

**Acceptance criteria:**
- Renders all step states (pending, running, completed, failed, warning, blocked, awaiting_confirmation)
- Training charts render with mock metric data
- Failed step shows inline error with suggestion
- Validation checkpoint shows report data with Proceed button
- Log viewer is scrollable and paginated

#### Task 3C-8: QA Review (Screen 4) — Placeholder

**Output:** `client/src/components/qa/QAReview.tsx`

Scaffold only — the 3D viewer integration comes in Phase 4/5. For now:
- Split layout (70/30)
- Right panel: Scene Info display, Alignment controls (Y offset, Y rotation inputs, Reset/Apply buttons), Overlay toggles, Action buttons (Enter VR, Export, Re-process)
- Left panel: Placeholder div with "3D Viewer will be integrated in Phase 5"

**Acceptance criteria:**
- Layout renders correctly
- Alignment controls accept numeric input
- Buttons are present and wired to console.log stubs

#### Task 3C-9: Settings Screen (Screen 5)

**Output:** `client/src/components/settings/SettingsScreen.tsx`

Form with all global defaults from design plan Section 6.6. Saves to localStorage initially (server persistence comes in Phase 4 integration).

**Acceptance criteria:**
- All settings render with correct defaults
- Changes persist across page reloads (localStorage)
- Theme toggle works (light/dark/system)

#### Quality Gate for Agent C

```bash
cd client
npm install
npx tsc --noEmit
npx eslint src/ --ext .ts,.tsx --max-warnings 0
npm run build
npm run dev &
sleep 5
# Visual check: open http://localhost:3000 in preview browser
# Verify: dashboard loads, navigation works, no console errors
kill %1
```

---

### Phase 3 Merge & Integration Check

After all three agents complete, merge branches in order: `pipeline` → `main`, `server` → `main`, `client` → `main`.

Run full quality gate: QG-1 through QG-6.

**Phase 3 complete when:**
- [ ] All scripts pass syntax/lint checks
- [ ] Server starts and health endpoint responds
- [ ] Client builds and all screens render
- [ ] Navigation between all 5 screens works
- [ ] No TypeScript errors
- [ ] No ESLint warnings

---

## Phase 4 — Backend-Frontend Integration

**Goal:** Server and client communicate end-to-end. Upload, pipeline control, live status, and log viewing all work through the UI.

**Prerequisite:** Phase 3 merge complete.

### Dependency Graph

```
PARALLEL WORKTREES:
┌─────────────────────────┐  ┌─────────────────────────┐
│  Agent D:               │  │  Agent E:               │
│  Server Integration     │  │  Client Integration     │
│  (branch: server-int)   │  │  (branch: client-int)   │
│                         │  │                         │
│  server/ only           │  │  client/ only           │
│  Focus: WebSocket,      │  │  Focus: Wire hooks to   │
│  status watcher,        │  │  real API calls,        │
│  metrics parser,        │  │  handle real WS data    │
│  hang detection         │  │                         │
└────────────┬────────────┘  └────────────┬────────────┘
             │                            │
             └────────────┬───────────────┘
                     MERGE TO MAIN
                          │
              QUALITY GATES QG-1..QG-7
                          │
                 INTEGRATION SMOKE TEST
```

### Task 4D: Server Integration (Agent D — branch: `server-int`)

**Scope:** `server/` only

#### Task 4D-1: Status Watcher Service

**Output:** `server/services/status_watcher.py`

Background asyncio task that:
- Polls `scenes/{id}/status.json` every 1 second
- Diffs against previous state
- On change: pushes WSMessage `{type: "status", data: ...}` to all connected clients for that scene_id

#### Task 4D-2: Training Metrics Parser

**Output:** `server/services/metrics_parser.py`

Background task that:
- Tails `scenes/{id}/training_metrics.log` line-by-line
- Parses each line into `TrainingMetric`
- Pushes WSMessage `{type: "metric", data: ...}` via WebSocket
- Detects anomalies (loss spike, NaN, stall, PSNR plateau) per Section 5.3

#### Task 4D-3: Hang Detection

Add to `server/services/pipeline_service.py`:
- Background task checking elapsed time per step
- Uses threshold table from Section 5.4
- Pushes WSMessage `{type: "warning", data: ...}` when warn threshold exceeded
- Offers kill option when kill threshold exceeded

#### Task 4D-4: GPU Stats Poller

Add to WebSocket manager:
- Every 30s, run `nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits`
- Push WSMessage `{type: "gpu", data: ...}`

#### Task 4D-5: Upload Chunk Reassembly

Ensure `server/routes/upload.py`:
- Handles multipart chunk upload (chunk_index, total_chunks, scene_id, file data)
- Reassembles chunks into `raw/{scene_id}.mp4`
- Validates video with ffprobe after reassembly
- Returns 200 on each chunk, final response includes video metadata

#### Quality Gate for Agent D

```bash
cd server
ruff check .
mypy . --ignore-missing-imports
pytest tests/ -v
# Start server, verify WebSocket connects
timeout 15 python -m uvicorn main:app --port 8000 &
sleep 3
curl -sf http://localhost:8000/api/health
python -c "
import asyncio, websockets, json
async def test():
    async with websockets.connect('ws://localhost:8000/api/ws/test_scene') as ws:
        print('WS connected OK')
asyncio.run(test())
"
kill %1
```

### Task 4E: Client Integration (Agent E — branch: `client-int`)

**Scope:** `client/` only

#### Task 4E-1: Wire API Hooks to Real Endpoints

Update all hooks (`useScenes`, `usePipelineStatus`, `useTrainingMetrics`) to call real API endpoints instead of mock data. Add loading states, error states, and retry logic.

#### Task 4E-2: Wire WebSocket Hook

Update `client/src/api/ws.ts`:
- Connect to `ws://localhost:8000/api/ws/{scene_id}` (via Vite proxy)
- Route incoming messages to appropriate state (status → pipeline status, metric → chart data, etc.)
- Auto-reconnect with 5s backoff

#### Task 4E-3: Wire Upload Flow

Connect `UploadPanel` to real chunked upload endpoint:
- Send 5MB chunks via POST
- Track upload progress
- On completion: transition to PipelineMonitor screen
- Handle errors (retry 3x, then show error)

#### Task 4E-4: Wire Pipeline Control

Connect PipelineMonitor buttons:
- "Start Processing" → POST `/api/pipeline/start/{scene_id}`
- "Cancel Pipeline" → POST `/api/pipeline/cancel/{scene_id}`
- "Proceed to Training" → POST `/api/pipeline/resume/{scene_id}/7`
- "Re-run with Data Factor 2" → POST `/api/pipeline/start/{scene_id}` with modified config
- "View Log" → GET `/api/pipeline/logs/{scene_id}/{step}`

#### Task 4E-5: Wire Alignment Controls

Connect QAReview alignment controls:
- "Apply" → PUT `/api/scene/{scene_id}/alignment` with transform matrix
- "Reset" → PUT `/api/scene/{scene_id}/alignment` with identity matrix
- "Export SPZ" → trigger download of SPZ file

#### Quality Gate for Agent E

```bash
cd client
npx tsc --noEmit
npx eslint src/ --ext .ts,.tsx --max-warnings 0
npm run build
```

### Phase 4 Merge & Integration Test

Merge `server-int` and `client-int` to main.

Run QG-1 through QG-7, including the integration smoke test.

**Visual verification in Preview browser:**
1. Open http://localhost:3000
2. Dashboard loads with scene list (may be empty)
3. Click "+ New Scene" → Upload screen renders
4. Navigate to Settings → form renders with defaults
5. No console errors on any screen
6. WebSocket connection indicator shows connected

**Phase 4 complete when:**
- [ ] Server and client communicate on all endpoints
- [ ] WebSocket delivers status updates
- [ ] Upload flow works end-to-end (client → server → file on disk)
- [ ] Pipeline can be started from UI (even if underlying tools aren't installed — the process.sh preflight should catch missing tools and report via status.json)
- [ ] No TypeScript or ESLint errors
- [ ] Visual check passes in preview browser

---

## Phase 5 — Viewer Integration (Spark + R3F)

**Goal:** 3D Gaussian splat viewer renders in the QA Review screen with Spark renderer.

**Prerequisite:** Phase 4 complete. Spark npm package installed.

**Single agent task** — touches `client/src/components/viewer/` and `client/src/components/qa/`.

### Task 5-1: SceneRenderer.tsx (Core Viewer)

**Output:** `client/src/components/viewer/SceneRenderer.tsx`

Implements `ViewerProps` interface. Uses `@sparkjsdev/spark` with React Three Fiber:

```typescript
// Key implementation requirements:
// 1. Load SPZ via Spark's SplatMesh
// 2. Apply alignment transform from alignment.json
// 3. Orbit controls (click-drag rotate, scroll zoom, right-click pan)
// 4. onProgress callback during SPZ download
// 5. onLoad callback when scene is ready
// 6. onError callback with Error object
// 7. FPS counter in bottom-left
// 8. maxStdDev: Math.sqrt(5) for Quest 3 optimization
// 9. Error boundary wrapping the R3F Canvas
```

**Acceptance criteria:**
- Renders a test SPZ file (use `public/test_scene.spz` or fetch garden.spz from a CDN)
- FPS counter displays
- Orbit controls work
- Loading progress bar shows during download
- Error boundary catches renderer crash and shows fallback message

### Task 5-2: Integrate Viewer into QA Review

Replace the placeholder in `QAReview.tsx` with actual `SceneRenderer` component. Wire up:
- Scene Info panel reads from actual scene config
- Floor grid overlay (Three.js GridHelper at Y=0)
- Alignment controls update transform in real-time (preview before Apply)

### Task 5-3: Floor Plane Adjuster

**Output:** `client/src/components/qa/FloorPlaneAdjuster.tsx`

- Y offset slider/input (meters)
- Y rotation slider/input (degrees)
- Live preview: adjustments apply to viewer transform immediately
- "Apply" saves to server, "Reset" returns to identity

### Task 5-4: Camera Path Viewer

**Output:** `client/src/components/qa/CameraPathViewer.tsx`

- Fetches camera positions from `/api/scene/{id}/cameras`
- Renders as Three.js Line geometry (colored by reprojection error)
- Small wireframe frustums at every 10th camera position
- Toggle on/off via QA Review overlay controls

### Task 5-5: VR Entry

- "Enter VR" button using Spark's VRButton (0.1.10) or SparkXr (2.0)
- Per-eye SparkViewpoint instantiation
- `antialias: false` in VR mode

### Quality Gate for Phase 5

```bash
cd client
npx tsc --noEmit
npx eslint src/ --ext .ts,.tsx --max-warnings 0
npm run build
npm run dev &
sleep 5
# Visual check in preview browser:
# 1. Navigate to /scene/test/review
# 2. 3D viewer renders (may show placeholder if no SPZ available)
# 3. Floor grid toggles on/off
# 4. Alignment controls accept input
# 5. FPS counter visible
# 6. No console errors
kill %1
```

**Phase 5 complete when:**
- [ ] SceneRenderer loads and renders an SPZ file
- [ ] Orbit controls work
- [ ] Floor grid overlay toggles
- [ ] Alignment controls update transform live
- [ ] Camera path overlay renders (with mock data if no COLMAP output available)
- [ ] VR button appears (functional VR testing requires hardware — document as manual test)
- [ ] No TypeScript or ESLint errors
- [ ] Visual check passes

---

## Phase 6 — Security Hardening

**Goal:** Fix all known security issues from the web UI audit.

**Single agent task** — touches `server/` only.

### Task 6-1: Command Injection Fix

Replace all `create_subprocess_shell()` with `create_subprocess_exec()`. Arguments passed as list, never as interpolated string.

### Task 6-2: Path Traversal Fix

All file-serving endpoints:
- Sanitize filenames (strip `..`, `/`, null bytes)
- Resolve paths and verify they're within allowed directories (`scenes/`, `raw/`)
- Reject requests outside allowed directories with 403

### Task 6-3: XSS Fix

Never interpolate user input into HTML. All responses are JSON (API) or served via Vite (static). If any templates exist, use auto-escaping.

### Task 6-4: Upload Size Limits

- Server-side: reject chunks after total exceeds 20GB
- Per-chunk: reject if chunk > 10MB
- Configurable via `config.py`

### Task 6-5: Rate Limiting

Add `slowapi` or custom middleware:
- Upload: 10 requests/minute per IP
- Pipeline start: 5 requests/minute per IP
- General API: 60 requests/minute per IP

### Quality Gate for Phase 6

```bash
cd server
ruff check .
mypy . --ignore-missing-imports
pytest tests/ -v
# Security-specific tests:
# - Attempt path traversal: curl should return 403
# - Attempt oversized upload: curl should return 413
# - Verify no shell=True in codebase:
grep -rn "subprocess_shell\|shell=True" server/ && echo "FAIL: shell execution found" && exit 1 || echo "PASS"
```

---

## Phase 7 — Viewer Extraction & Polish

**Goal:** Viewer component is extractable and works standalone.

### Task 7-1: Clean Interface Boundary

Verify `SceneRenderer.tsx` has no imports from `../pipeline/`, `../upload/`, `../dashboard/`, or `../../api/`. It should only depend on:
- React, React Three Fiber, Three.js, Spark
- Its own types (`ViewerProps`, `SceneConfig`)

### Task 7-2: Standalone Test Page

Create `client/src/viewer/standalone.html` that loads the viewer component with a hardcoded scene config. Verify it works without the rest of the application.

### Task 7-3: Mobile Optimization

- Touch controls (one-finger orbit, pinch zoom, two-finger pan)
- Gaussian budget cap at 300K on mobile (detect via `navigator.maxTouchPoints > 0`)
- No VR button on mobile

### Quality Gate for Phase 7

```bash
cd client
npx tsc --noEmit
npm run build
# Verify viewer has no pipeline imports:
grep -rn "from.*pipeline\|from.*upload\|from.*dashboard" client/src/components/viewer/ && echo "FAIL" && exit 1 || echo "PASS: no pipeline imports in viewer"
```

---

## Phase Summary & Agent Assignment

| Phase | Agents | Branches | Key Output |
|-------|--------|----------|------------|
| PR-1..5 | Owner (Aaron) | main | SETUP.md, config/pipeline_defaults.json, docs/ |
| 3A | Agent A | pipeline | scripts/*.sh, scripts/*.py, config/ |
| 3B | Agent B | server | server/ full skeleton |
| 3C | Agent C | client | client/ full scaffold |
| 4D | Agent D | server-int | server/ WebSocket, watcher, parser |
| 4E | Agent E | client-int | client/ wired to real API |
| 5 | Agent F | viewer | client/src/components/viewer/, qa/ |
| 6 | Agent G | security | server/ hardening |
| 7 | Agent H | viewer-extract | client/src/viewer/ standalone |

**Maximum parallelism:** 3 agents in Phase 3, 2 agents in Phase 4. All other phases are single-agent.

**Token optimization:** Each agent receives only the sections of this plan relevant to its task, plus the shared type definitions. Agents do not need the full design plan history, failure modes, or future roadmap.

---

## Appendix: Error Message Constants

Create `server/constants/error_messages.py` and `client/src/utils/errorMessages.ts` with all user-facing error messages from Section 12 of the design plan. Both files must have identical message strings to ensure consistency between server-generated and client-rendered error states.

---

*Plan version: 1.0 — March 15, 2026*
*Source: VrScout_v3_design_plan.md*
*Target: Claude Code with Team Agents & Worktree*
