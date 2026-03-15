# VR Scout v3 — Environment Setup

## Date: 2026-03-15

## System

- **OS**: Windows 11 Pro 10.0.26200
- **GPU**: NVIDIA GeForce RTX 4070 Laptop GPU, 8188 MiB VRAM, Compute Capability 8.9
- **Driver**: 576.80
- **Node.js**: v22.21.0
- **npm**: (bundled with Node 22)
- **Python**: 3.12.10 (`C:/Users/aaron/AppData/Local/Programs/Python/Python312/python.exe`)

## Installed Tools

| Tool | Version | Install Method | Status |
|------|---------|---------------|--------|
| nvidia-smi | Driver 576.80 | Pre-installed | Working |
| Node.js | v22.21.0 | Pre-installed | Working |
| Python | 3.12.10 | Pre-installed | Working |
| ffmpeg | 8.0.1 | `winget install Gyan.FFmpeg` | Installed (needs shell restart for PATH) |
| Miniconda3 | py313_26.1.1-1 | `winget install Anaconda.Miniconda3` | Installed (needs shell restart for PATH) |

## Deferred to WSL/Linux

These tools require Linux with CUDA toolkit and cannot be installed on Windows:

| Tool | Reason | Install Command (WSL) |
|------|--------|----------------------|
| COLMAP | Linux binary, needs CUDA 11.8+ | `conda install -c conda-forge colmap -y` |
| gsplat | CUDA compilation required | `git clone https://github.com/nerfstudio-project/gsplat.git tools/gsplat && pip install gsplat` |
| 3dgsconverter | Taichi/CUDA GPU acceleration | `pip install git+https://github.com/francescofugazzi/3dgsconverter.git` |

## Conda Environment (to be created on WSL)

```bash
conda create -n splat python=3.11 -y
conda activate splat
# Set CUDA_HOME
mkdir -p ~/miniconda3/envs/splat/etc/conda/activate.d/
echo 'export CUDA_HOME=/usr/local/cuda-11.8' > ~/miniconda3/envs/splat/etc/conda/activate.d/cuda.sh
```

## COLMAP Subcommands (to verify on WSL)

Expected subcommands needed by pipeline:
- `colmap feature_extractor`
- `colmap exhaustive_matcher` / `colmap sequential_matcher`
- `colmap mapper`
- `colmap model_orientation_aligner`

## Notes

- Pipeline scripts (`scripts/process.sh`, etc.) target bash on Linux/WSL
- The FastAPI server and React client run on Windows for development
- Full pipeline testing requires WSL with CUDA toolkit
