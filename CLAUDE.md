# VR Scout v3 — Agent Instructions

## Project Overview

VR Scout v3 is an end-to-end system for converting video footage into photorealistic 3D Gaussian Splat scenes, viewable in browser with WebXR VR support. Architecture: FastAPI backend + React/R3F/Vite client + bash/Python pipeline scripts.

## Hard Constraints (violating any is always wrong)

- **Never** use `create_subprocess_shell` or `shell=True` — always `create_subprocess_exec` with argument lists
- **Viewer** (`client/src/components/viewer/`) must never import from pipeline, upload, dashboard, or api directories
- Pydantic models and TypeScript types must match exactly
- SQLite for job management — never jobs.json
- SPZ is the only output format, coordinate system always RUB
- gsplat invocation: `python examples/simple_trainer.py` (never `python -m gsplat.simple_trainer`)
- Use 3dgsconverter for PLY→SPZ (never the spz Python library — circular import bug)
- No Postshot, Luma AI, or Nerfstudio — 100% open source toolchain
- Always `--single_camera 1` in COLMAP for video-sourced frames
- Always preserve PLY originals alongside SPZ

## Tech Stack

- **Client**: Vite + React 19 + TypeScript strict + React Three Fiber + Three.js + Spark (@sparkjsdev/spark)
- **Server**: FastAPI + Python 3.12 + aiosqlite + pydantic v2
- **Pipeline**: bash orchestration + COLMAP + gsplat + 3dgsconverter + ffmpeg
- **Charts**: Recharts (training metrics)
- **Routing**: react-router-dom v7

## Directory Structure

```
vr-scout-v3/
├── client/          # React + Vite frontend
├── server/          # FastAPI backend
├── scripts/         # Pipeline orchestration (process.sh, validate_colmap.py, etc.)
├── config/          # Pipeline defaults (pipeline_defaults.json)
├── docs/            # Design documents
├── raw/             # Uploaded video files
├── scenes/          # Processed scene data
└── tools/           # External tool repos (gsplat clone)
```

## Rules

- Run `npx tsc --noEmit` in client/ after changes to verify types
- Run `ruff check` in server/ after Python changes
- Pipeline scripts target bash on Linux/WSL
- All new code must be TypeScript strict mode compliant (client) or mypy-clean (server)
