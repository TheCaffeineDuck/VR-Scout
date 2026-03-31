#!/usr/bin/env bash
# VR Scout v4 — Hardware-Adaptive Environment Setup
# Detects GPU, CUDA, and installs all dependencies from source.
# Run once on initial setup; safe to re-run after hardware changes.
#
# Usage:
#   bash scripts/setup_environment.sh
#   bash scripts/setup_environment.sh --skip-builds
#   bash scripts/setup_environment.sh --no-color

set -uo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONDA_ENV="splat"
PYTHON_VERSION="3.10"
PROFILE_PATH="$PROJECT_ROOT/config/hardware_profile.json"
ENV_MD_PATH="$PROJECT_ROOT/ENVIRONMENT.md"

SKIP_BUILDS=false
NO_COLOR=false

for arg in "$@"; do
    case "$arg" in
        --skip-builds) SKIP_BUILDS=true ;;
        --no-color) NO_COLOR=true ;;
    esac
done

# ─── Colors ──────────────────────────────────────────────────────────────────
if [ "$NO_COLOR" = true ]; then
    RED="" GREEN="" YELLOW="" BLUE="" BOLD="" RESET=""
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    RESET='\033[0m'
fi

info()     { echo -e "${BLUE}[INFO]${RESET} $*"; }
pass_msg() { echo -e "${GREEN}[PASS]${RESET} $*"; }
fail_msg() { echo -e "${RED}[FAIL]${RESET} $*"; }
warn_msg() { echo -e "${YELLOW}[WARN]${RESET} $*"; }
header()   { echo -e "\n${BOLD}═══ $* ═══${RESET}\n"; }

CRITICAL_FAIL=false

# ─── GPU Detection ───────────────────────────────────────────────────────────
header "GPU Detection"

if ! command -v nvidia-smi &>/dev/null; then
    fail_msg "nvidia-smi not found — is the NVIDIA driver installed?"
    CRITICAL_FAIL=true
    GPU_NAME="unknown"
    GPU_VRAM_MB=0
    COMPUTE_CAP="0.0"
    DRIVER_VERSION="0"
else
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total,compute_cap,driver_version --format=csv,noheader,nounits 2>/dev/null)
    if [ $? -ne 0 ] || [ -z "$GPU_INFO" ]; then
        fail_msg "nvidia-smi query failed"
        CRITICAL_FAIL=true
        GPU_NAME="unknown"
        GPU_VRAM_MB=0
        COMPUTE_CAP="0.0"
        DRIVER_VERSION="0"
    else
        GPU_NAME=$(echo "$GPU_INFO" | cut -d',' -f1 | xargs)
        GPU_VRAM_MB=$(echo "$GPU_INFO" | cut -d',' -f2 | xargs | cut -d'.' -f1)
        COMPUTE_CAP=$(echo "$GPU_INFO" | cut -d',' -f3 | xargs)
        DRIVER_VERSION=$(echo "$GPU_INFO" | cut -d',' -f4 | xargs)

        pass_msg "GPU: $GPU_NAME"
        pass_msg "VRAM: ${GPU_VRAM_MB} MB"
        pass_msg "Compute Capability: $COMPUTE_CAP"
        pass_msg "Driver: $DRIVER_VERSION"
    fi
fi

# SM architecture lookup
SM_ARCH=0
case "$COMPUTE_CAP" in
    8.6) SM_ARCH=86 ;;
    8.9) SM_ARCH=89 ;;
    12.0) SM_ARCH=120 ;;
    7.5) SM_ARCH=75 ;;
    8.0) SM_ARCH=80 ;;
    9.0) SM_ARCH=90 ;;
    *)
        # Derive from compute cap string: "8.6" -> 86
        MAJOR=$(echo "$COMPUTE_CAP" | cut -d'.' -f1)
        MINOR=$(echo "$COMPUTE_CAP" | cut -d'.' -f2)
        if [ -n "$MAJOR" ] && [ -n "$MINOR" ]; then
            SM_ARCH=$((MAJOR * 10 + MINOR))
        fi
        ;;
esac

if [ "$SM_ARCH" -gt 0 ]; then
    pass_msg "SM Architecture: SM $SM_ARCH"
else
    warn_msg "Could not determine SM architecture"
fi

# ─── CUDA Toolkit Detection ─────────────────────────────────────────────────
header "CUDA Toolkit Detection"

DETECTED_CUDA_HOME=""
DETECTED_NVCC=""

# Search order for nvcc
SEARCH_PATHS=(
    "${CONDA_PREFIX:-}/bin/nvcc"
    "/usr/local/cuda/bin/nvcc"
)

# Add versioned CUDA paths (sorted descending to prefer highest version)
for d in $(ls -1d /usr/local/cuda-*/bin/nvcc 2>/dev/null | sort -rV); do
    SEARCH_PATHS+=("$d")
done

# System PATH as fallback
SYSTEM_NVCC=$(which nvcc 2>/dev/null || true)
if [ -n "$SYSTEM_NVCC" ]; then
    SEARCH_PATHS+=("$SYSTEM_NVCC")
fi

for nvcc_path in "${SEARCH_PATHS[@]}"; do
    if [ -x "$nvcc_path" ]; then
        DETECTED_NVCC="$nvcc_path"
        # CUDA_HOME is parent of parent of nvcc (e.g., /usr/local/cuda-12.8/bin/nvcc -> /usr/local/cuda-12.8)
        DETECTED_CUDA_HOME="$(dirname "$(dirname "$nvcc_path")")"
        break
    fi
done

if [ -z "$DETECTED_NVCC" ]; then
    fail_msg "nvcc not found in any standard location"
    fail_msg "Install CUDA toolkit or set CUDA_HOME manually"
    CRITICAL_FAIL=true
    CUDA_VERSION="0.0"
else
    # Parse CUDA version from nvcc --version
    NVCC_OUTPUT=$("$DETECTED_NVCC" --version 2>/dev/null)
    CUDA_VERSION=$(echo "$NVCC_OUTPUT" | grep -oP 'release \K[\d.]+' || echo "0.0")

    pass_msg "nvcc: $DETECTED_NVCC"
    pass_msg "CUDA Version: $CUDA_VERSION"
    pass_msg "CUDA_HOME: $DETECTED_CUDA_HOME"

    # Validate CUDA version for SM architecture
    CUDA_MAJOR=$(echo "$CUDA_VERSION" | cut -d'.' -f1)
    CUDA_MINOR=$(echo "$CUDA_VERSION" | cut -d'.' -f2)
    CUDA_VER_NUM=$((CUDA_MAJOR * 10 + CUDA_MINOR))

    if [ "$SM_ARCH" -ge 120 ] && [ "$CUDA_VER_NUM" -lt 128 ]; then
        fail_msg "SM $SM_ARCH (Blackwell) requires CUDA 12.8+, found $CUDA_VERSION"
        CRITICAL_FAIL=true
    elif [ "$SM_ARCH" -ge 86 ] && [ "$CUDA_VER_NUM" -lt 118 ]; then
        fail_msg "SM $SM_ARCH requires CUDA 11.8+, found $CUDA_VERSION"
        CRITICAL_FAIL=true
    else
        pass_msg "CUDA $CUDA_VERSION is compatible with SM $SM_ARCH"
    fi
fi

# ─── Dynamic CUDA_HOME Setup ────────────────────────────────────────────────
header "Conda CUDA_HOME Configuration"

if [ -n "$DETECTED_CUDA_HOME" ]; then
    # Find conda prefix
    CONDA_PREFIX_TARGET=""
    if command -v conda &>/dev/null; then
        CONDA_PREFIX_TARGET=$(conda info --envs 2>/dev/null | grep "^$CONDA_ENV " | awk '{print $NF}')
        if [ -z "$CONDA_PREFIX_TARGET" ]; then
            # Try miniconda3 default path
            for base in ~/miniconda3 ~/anaconda3 ~/miniforge3; do
                if [ -d "$base/envs/$CONDA_ENV" ]; then
                    CONDA_PREFIX_TARGET="$base/envs/$CONDA_ENV"
                    break
                fi
            done
        fi
    fi

    if [ -n "$CONDA_PREFIX_TARGET" ]; then
        ACTIVATE_DIR="$CONDA_PREFIX_TARGET/etc/conda/activate.d"
        DEACTIVATE_DIR="$CONDA_PREFIX_TARGET/etc/conda/deactivate.d"
        mkdir -p "$ACTIVATE_DIR" "$DEACTIVATE_DIR"

        cat > "$ACTIVATE_DIR/cuda.sh" <<CUDA_ACTIVATE
#!/bin/bash
export CUDA_HOME="$DETECTED_CUDA_HOME"
export PATH="\$CUDA_HOME/bin:\$PATH"
export LD_LIBRARY_PATH="\$CUDA_HOME/lib64:\${LD_LIBRARY_PATH:-}"
CUDA_ACTIVATE

        cat > "$DEACTIVATE_DIR/cuda.sh" <<CUDA_DEACTIVATE
#!/bin/bash
unset CUDA_HOME
CUDA_DEACTIVATE

        chmod +x "$ACTIVATE_DIR/cuda.sh" "$DEACTIVATE_DIR/cuda.sh"
        pass_msg "Wrote conda activation script: $ACTIVATE_DIR/cuda.sh"

        # Export for current session
        export CUDA_HOME="$DETECTED_CUDA_HOME"
        export PATH="$CUDA_HOME/bin:$PATH"
        export LD_LIBRARY_PATH="$CUDA_HOME/lib64:${LD_LIBRARY_PATH:-}"
    else
        warn_msg "Conda env '$CONDA_ENV' not found — CUDA_HOME activation script not written"
        warn_msg "Will create env in next step"
    fi
fi

# ─── Hardware Profile Selection ──────────────────────────────────────────────
header "Hardware Profile"

GPU_VRAM_GB=$(echo "scale=1; $GPU_VRAM_MB / 1024" | bc 2>/dev/null || echo "0")

if [ "$(echo "$GPU_VRAM_GB >= 16" | bc 2>/dev/null)" = "1" ]; then
    PROFILE="full"
    DATA_FACTOR=1
    MAX_STEPS=30000
    DEPTH_MODEL="Large"
    SEG_ENABLED=true
    PRUNE_ENABLED=true
elif [ "$(echo "$GPU_VRAM_GB >= 8" | bc 2>/dev/null)" = "1" ]; then
    PROFILE="standard"
    DATA_FACTOR=1
    MAX_STEPS=30000
    DEPTH_MODEL="Base"
    SEG_ENABLED=true
    PRUNE_ENABLED=true
else
    PROFILE="constrained"
    DATA_FACTOR=2
    MAX_STEPS=20000
    DEPTH_MODEL="Small"
    SEG_ENABLED=false
    PRUNE_ENABLED=false
fi

pass_msg "Profile: $PROFILE (VRAM: ${GPU_VRAM_GB}GB)"
info "  data_factor=$DATA_FACTOR, max_steps=$MAX_STEPS, depth_model=$DEPTH_MODEL"

# Write hardware profile JSON
mkdir -p "$(dirname "$PROFILE_PATH")"
cat > "$PROFILE_PATH" <<PROFILE_JSON
{
  "gpu_name": "$GPU_NAME",
  "gpu_vram_gb": $GPU_VRAM_GB,
  "compute_capability": "$COMPUTE_CAP",
  "sm_architecture": $SM_ARCH,
  "cuda_toolkit_version": "$CUDA_VERSION",
  "cuda_home": "$DETECTED_CUDA_HOME",
  "pytorch_cuda_version": "",
  "profile": "$PROFILE",
  "defaults": {
    "data_factor": $DATA_FACTOR,
    "max_steps": $MAX_STEPS,
    "depth_model": "$DEPTH_MODEL",
    "segmentation_enabled": $SEG_ENABLED,
    "perceptual_pruning_enabled": $PRUNE_ENABLED
  },
  "detected_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
PROFILE_JSON

pass_msg "Hardware profile written to $PROFILE_PATH"

# ─── Package Installation ────────────────────────────────────────────────────
header "Package Installation"

if [ "$SKIP_BUILDS" = true ]; then
    info "Skipping package installation (--skip-builds)"
else
    # Check/create conda env
    if ! conda info --envs 2>/dev/null | grep -q "^$CONDA_ENV "; then
        info "Creating conda environment '$CONDA_ENV' (Python $PYTHON_VERSION)..."
        conda create -n "$CONDA_ENV" python="$PYTHON_VERSION" -y
    else
        pass_msg "Conda environment '$CONDA_ENV' exists"
    fi

    # Activate env
    eval "$(conda shell.bash hook)"
    conda activate "$CONDA_ENV"

    # Re-write activation script now that env exists
    if [ -n "$DETECTED_CUDA_HOME" ]; then
        ACTIVATE_DIR="$CONDA_PREFIX/etc/conda/activate.d"
        DEACTIVATE_DIR="$CONDA_PREFIX/etc/conda/deactivate.d"
        mkdir -p "$ACTIVATE_DIR" "$DEACTIVATE_DIR"

        cat > "$ACTIVATE_DIR/cuda.sh" <<CUDA_ACTIVATE2
#!/bin/bash
export CUDA_HOME="$DETECTED_CUDA_HOME"
export PATH="\$CUDA_HOME/bin:\$PATH"
export LD_LIBRARY_PATH="\$CUDA_HOME/lib64:\${LD_LIBRARY_PATH:-}"
CUDA_ACTIVATE2

        cat > "$DEACTIVATE_DIR/cuda.sh" <<CUDA_DEACTIVATE2
#!/bin/bash
unset CUDA_HOME
CUDA_DEACTIVATE2

        chmod +x "$ACTIVATE_DIR/cuda.sh" "$DEACTIVATE_DIR/cuda.sh"
        export CUDA_HOME="$DETECTED_CUDA_HOME"
        export PATH="$CUDA_HOME/bin:$PATH"
        export LD_LIBRARY_PATH="$CUDA_HOME/lib64:${LD_LIBRARY_PATH:-}"
    fi

    # Select PyTorch index URL based on CUDA version
    CUDA_MAJOR=$(echo "$CUDA_VERSION" | cut -d'.' -f1)
    CUDA_MINOR=$(echo "$CUDA_VERSION" | cut -d'.' -f2)
    CUDA_VER_NUM=$((CUDA_MAJOR * 10 + CUDA_MINOR))

    if [ "$CUDA_VER_NUM" -ge 128 ]; then
        TORCH_INDEX="https://download.pytorch.org/whl/cu128"
        TORCH_CUDA_TAG="cu128"
    elif [ "$CUDA_VER_NUM" -ge 124 ]; then
        TORCH_INDEX="https://download.pytorch.org/whl/cu124"
        TORCH_CUDA_TAG="cu124"
    elif [ "$CUDA_VER_NUM" -ge 121 ]; then
        TORCH_INDEX="https://download.pytorch.org/whl/cu121"
        TORCH_CUDA_TAG="cu121"
    else
        TORCH_INDEX="https://download.pytorch.org/whl/cu118"
        TORCH_CUDA_TAG="cu118"
    fi

    info "PyTorch index: $TORCH_INDEX ($TORCH_CUDA_TAG)"

    # Install PyTorch
    info "Installing PyTorch..."
    pip install torch torchvision torchaudio --index-url "$TORCH_INDEX"
    TORCH_EXIT=$?
    if [ $TORCH_EXIT -ne 0 ]; then
        fail_msg "PyTorch installation failed"
        CRITICAL_FAIL=true
    else
        PYTORCH_CUDA=$(python -c "import torch; print(torch.version.cuda or 'cpu')" 2>/dev/null)
        pass_msg "PyTorch installed (CUDA: $PYTORCH_CUDA)"

        # Update hardware profile with PyTorch CUDA version
        if command -v python &>/dev/null; then
            python -c "
import json
with open('$PROFILE_PATH', 'r') as f:
    p = json.load(f)
p['pytorch_cuda_version'] = '$PYTORCH_CUDA'
with open('$PROFILE_PATH', 'w') as f:
    json.dump(p, f, indent=2)
" 2>/dev/null || true
        fi
    fi

    # Build gsplat from source
    info "Building gsplat from source..."
    pip install gsplat --no-binary :all:
    if [ $? -ne 0 ]; then
        fail_msg "gsplat build failed"
        CRITICAL_FAIL=true
    else
        pass_msg "gsplat installed"
    fi

    # Build fused-ssim from source
    info "Building fused-ssim from source..."
    pip install fused-ssim --no-binary :all:
    if [ $? -ne 0 ]; then
        warn_msg "fused-ssim build failed (may not be needed)"
    else
        pass_msg "fused-ssim installed"
    fi

    # Install 3dgsconverter
    info "Installing 3dgsconverter..."
    pip install git+https://github.com/francescofugazzi/3dgsconverter.git
    if [ $? -ne 0 ]; then
        warn_msg "3dgsconverter installation failed"
    else
        pass_msg "3dgsconverter installed"
    fi

    # Install server Python dependencies
    info "Installing server dependencies..."
    pip install fastapi "uvicorn[standard]" aiosqlite websockets pydantic pydantic-settings
    if [ $? -ne 0 ]; then
        fail_msg "Server dependency installation failed"
        CRITICAL_FAIL=true
    else
        pass_msg "Server dependencies installed"
    fi

    # Clone gsplat repo for trainer script
    GSPLAT_DIR="$PROJECT_ROOT/tools/gsplat"
    if [ ! -d "$GSPLAT_DIR" ]; then
        info "Cloning gsplat repository..."
        git clone https://github.com/nerfstudio-project/gsplat.git "$GSPLAT_DIR"
        if [ $? -ne 0 ]; then
            warn_msg "gsplat repo clone failed"
        else
            pass_msg "gsplat repo cloned to $GSPLAT_DIR"
        fi
    else
        pass_msg "gsplat repo already exists at $GSPLAT_DIR"
    fi

    # Install system tools
    info "Checking system tools..."

    if ! command -v exiftool &>/dev/null; then
        info "Installing exiftool..."
        sudo apt install libimage-exiftool-perl -y 2>/dev/null || warn_msg "exiftool install failed"
    else
        pass_msg "exiftool: $(exiftool -ver 2>/dev/null)"
    fi

    if ! command -v ffmpeg &>/dev/null; then
        info "Installing ffmpeg..."
        sudo apt install ffmpeg -y 2>/dev/null || warn_msg "ffmpeg install failed"
    else
        pass_msg "ffmpeg: $(ffmpeg -version 2>/dev/null | head -1)"
    fi

    if command -v colmap &>/dev/null; then
        pass_msg "colmap: $(colmap help 2>&1 | head -1)"
    else
        warn_msg "COLMAP not found — install manually (https://colmap.github.io/install.html)"
    fi
fi

# ─── Smoke Tests ─────────────────────────────────────────────────────────────
header "Smoke Tests"

SMOKE_PASS=0
SMOKE_FAIL=0

run_smoke() {
    local label="$1"
    shift
    if eval "$@" &>/dev/null; then
        pass_msg "$label"
        ((SMOKE_PASS++))
    else
        fail_msg "$label"
        ((SMOKE_FAIL++))
    fi
}

# Activate conda env for smoke tests
if command -v conda &>/dev/null; then
    eval "$(conda shell.bash hook)" 2>/dev/null
    conda activate "$CONDA_ENV" 2>/dev/null || true
fi

run_smoke "PyTorch + CUDA" "python -c \"import torch; assert torch.cuda.is_available(); print(f'PyTorch: {torch.__version__}, CUDA: {torch.version.cuda}')\""
run_smoke "gsplat" "python -c \"import gsplat; print('gsplat: OK')\""
run_smoke "fused-ssim" "python -c \"import fused_ssim; print('fused-ssim: OK')\""
run_smoke "nvidia-smi" "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader"
run_smoke "ffmpeg" "ffmpeg -version"
run_smoke "exiftool" "exiftool -ver"

if [ -f "$PROJECT_ROOT/tools/gsplat/examples/simple_trainer.py" ]; then
    pass_msg "gsplat trainer: OK"
    ((SMOKE_PASS++))
else
    fail_msg "gsplat trainer: NOT FOUND"
    ((SMOKE_FAIL++))
fi

if command -v colmap &>/dev/null; then
    pass_msg "COLMAP: $(colmap help 2>&1 | head -1)"
    ((SMOKE_PASS++))
else
    warn_msg "COLMAP: NOT FOUND (install manually)"
fi

echo ""
info "Smoke tests: $SMOKE_PASS passed, $SMOKE_FAIL failed"

# ─── Write ENVIRONMENT.md ────────────────────────────────────────────────────
header "Writing ENVIRONMENT.md"

PYTORCH_VER=$(python -c "import torch; print(torch.__version__)" 2>/dev/null || echo "not installed")
PYTORCH_CUDA_VER=$(python -c "import torch; print(torch.version.cuda or 'cpu')" 2>/dev/null || echo "unknown")

cat > "$ENV_MD_PATH" <<ENVMD
# VR Scout v4 — Environment Report

Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## GPU
- **Name:** $GPU_NAME
- **VRAM:** ${GPU_VRAM_GB} GB (${GPU_VRAM_MB} MB)
- **Compute Capability:** $COMPUTE_CAP
- **SM Architecture:** SM $SM_ARCH
- **Driver:** $DRIVER_VERSION

## CUDA
- **Toolkit Version:** $CUDA_VERSION
- **CUDA_HOME:** $DETECTED_CUDA_HOME
- **PyTorch Version:** $PYTORCH_VER
- **PyTorch CUDA:** $PYTORCH_CUDA_VER

## Hardware Profile
- **Profile:** $PROFILE
- **data_factor:** $DATA_FACTOR
- **max_steps:** $MAX_STEPS
- **depth_model:** $DEPTH_MODEL
- **segmentation_enabled:** $SEG_ENABLED
- **perceptual_pruning_enabled:** $PRUNE_ENABLED

## Smoke Test Results
- Passed: $SMOKE_PASS
- Failed: $SMOKE_FAIL

## Warnings
$(if [ "$CRITICAL_FAIL" = true ]; then echo "- CRITICAL FAILURES DETECTED"; fi)
$(if ! command -v colmap &>/dev/null; then echo "- COLMAP not installed"; fi)
ENVMD

pass_msg "ENVIRONMENT.md written to $ENV_MD_PATH"

# ─── Final Summary ───────────────────────────────────────────────────────────
header "Summary"

if [ "$CRITICAL_FAIL" = true ]; then
    fail_msg "Setup completed with CRITICAL FAILURES"
    fail_msg "Fix the issues above and re-run this script"
    exit 1
else
    pass_msg "Setup completed successfully!"
    pass_msg "Profile: $PROFILE | GPU: $GPU_NAME | CUDA: $CUDA_VERSION"
    info "Next: conda activate $CONDA_ENV && cd $PROJECT_ROOT && uvicorn server.main:app --port 8002"
    exit 0
fi
