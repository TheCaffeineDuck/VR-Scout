# VR Scout v3 — Environment Setup

## Date: 2026-03-15

## System

- **OS**: Windows 11 Pro 10.0.26200
- **GPU**: NVIDIA GeForce RTX 4070 Laptop GPU, 8188 MiB VRAM, Compute Capability 8.9
- **Driver**: 576.80
- **Node.js**: v22.21.0
- **npm**: (bundled with Node 22)
- **Python (Windows)**: 3.12.10 (`C:/Users/aaron/AppData/Local/Programs/Python/Python312/python.exe`)
- **Python (WSL)**: 3.10.19 (conda `splat` environment)
- **WSL Distro**: Ubuntu-22.04

## Starting the Dev Environment

### Terminal 1 — FastAPI Server (WSL)

```bash
wsl -d Ubuntu-22.04
conda activate splat
cd /mnt/c/Users/aaron/Desktop/vr-scout-v3
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2 — React Client (Windows or WSL)

```bash
cd client
npm run dev
```

### Open the App

Navigate to http://localhost:3000

### Architecture

```
Browser (localhost:3000)
  │
  ├── /api/* ──► Vite proxy ──► FastAPI (localhost:8000, WSL)
  │                                │
  │                                ├── SQLite (vr_scout.db)
  │                                ├── Upload → raw/{scene_id}.mp4
  │                                └── Pipeline → bash scripts/process.sh
  │                                                  │
  │                                                  ├── ffmpeg (frame extraction)
  │                                                  ├── COLMAP (SfM reconstruction)
  │                                                  ├── gsplat (3DGS training)
  │                                                  └── 3dgsconverter (PLY→SPZ)
  │
  └── /api/ws/* ──► WebSocket proxy ──► FastAPI WebSocket
```

## Path Integration (Windows ↔ WSL)

The project lives on the Windows filesystem at:
- **Windows**: `C:\Users\aaron\Desktop\vr-scout-v3`
- **WSL**: `/mnt/c/Users/aaron/Desktop/vr-scout-v3`

Both sides can read/write files here. The key split:
- **Windows side**: Node.js, Vite dev server, browser
- **WSL side**: Python/FastAPI server, conda environment, COLMAP, gsplat, 3dgsconverter, ffmpeg

Pipeline tools (COLMAP, gsplat, etc.) are installed in the WSL conda env `splat`, not on Windows. The FastAPI server must run from WSL so `process.sh` can invoke these tools.

Upload files are saved to `raw/{scene_id}.mp4` at the project root, which `process.sh` reads from `$PROJECT_ROOT/raw/`.

## Installed Tools

| Tool | Version | Install Method | Status |
|------|---------|---------------|--------|
| nvidia-smi | Driver 576.80 | Pre-installed | Working |
| Node.js | v22.21.0 | Pre-installed | Working |
| Python | 3.12.10 | Pre-installed | Working (Windows) |
| ffmpeg | 8.0.1 | `winget install Gyan.FFmpeg` | Working |
| Miniconda3 | py313_26.1.1-1 | `winget install Anaconda.Miniconda3` | Working |

## WSL Pipeline Tools (conda `splat` env)

| Tool | Install Command (WSL) |
|------|----------------------|
| COLMAP | `conda install -c conda-forge colmap -y` |
| gsplat | `git clone https://github.com/nerfstudio-project/gsplat.git tools/gsplat && pip install gsplat` |
| 3dgsconverter | `pip install git+https://github.com/francescofugazzi/3dgsconverter.git` |

## Conda Environment Setup (WSL)

```bash
conda create -n splat python=3.11 -y
conda activate splat
# Set CUDA_HOME
mkdir -p ~/miniconda3/envs/splat/etc/conda/activate.d/
echo 'export CUDA_HOME=/usr/local/cuda-11.8' > ~/miniconda3/envs/splat/etc/conda/activate.d/cuda.sh
# Install server dependencies
pip install pydantic-settings fastapi aiosqlite uvicorn
```

## Notes

- Pipeline scripts (`scripts/process.sh`, etc.) target bash on Linux/WSL
- The React client runs on Windows; the FastAPI server runs in WSL
- Full pipeline testing requires WSL with CUDA toolkit
- `process.sh` accepts CLI config overrides: `--camera-model`, `--matcher`, `--iterations`, `--sh-degree`, `--data-factor`, `--frame-fps`
