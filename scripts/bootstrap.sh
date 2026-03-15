#!/bin/bash
# bootstrap.sh — Idempotent setup for VR Scout v3 pipeline dependencies
#
# Safe to run multiple times. Clones gsplat if missing, installs Python
# deps, installs Node deps. Checks for conda env and CUDA_HOME.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== VR Scout v3 Bootstrap ==="
echo "Project root: $PROJECT_ROOT"

# ─── Check prerequisites ─────────────────────────────────────────
WARNINGS=""

if [ -z "${CUDA_HOME:-}" ]; then
  WARNINGS+="  - CUDA_HOME is not set. GPU training requires CUDA.\n"
fi

if ! command -v conda &> /dev/null; then
  WARNINGS+="  - conda not found. Recommended: create a 'splat' conda env.\n"
fi

if [ -n "$WARNINGS" ]; then
  echo ""
  echo "Warnings (non-blocking):"
  echo -e "$WARNINGS"
fi

# ─── Clone gsplat repo (need examples/simple_trainer.py) ─────────
GSPLAT_DIR="$PROJECT_ROOT/tools/gsplat"
if [ ! -d "$GSPLAT_DIR" ]; then
  echo "Cloning gsplat..."
  mkdir -p "$PROJECT_ROOT/tools"
  git clone --depth 1 https://github.com/nerfstudio-project/gsplat.git "$GSPLAT_DIR"
  echo "gsplat cloned to $GSPLAT_DIR"
else
  echo "gsplat already present at $GSPLAT_DIR — skipping clone."
fi

# ─── Install Python dependencies ─────────────────────────────────
echo ""
echo "Installing Python dependencies..."

# gsplat (the pip package, for the library)
if python3 -c "import gsplat" 2>/dev/null; then
  echo "gsplat Python package already installed."
else
  echo "Installing gsplat..."
  pip install gsplat 2>/dev/null || pip install gsplat --break-system-packages 2>/dev/null || echo "WARNING: Failed to install gsplat. Install manually."
fi

# 3dgsconverter
if command -v 3dgsconverter &> /dev/null; then
  echo "3dgsconverter already installed."
else
  echo "Installing 3dgsconverter..."
  pip install "git+https://github.com/francescofugazzi/3dgsconverter.git" 2>/dev/null || \
    pip install "git+https://github.com/francescofugazzi/3dgsconverter.git" --break-system-packages 2>/dev/null || \
    echo "WARNING: Failed to install 3dgsconverter. Install manually."
fi

# Server Python deps
if [ -f "$PROJECT_ROOT/server/requirements.txt" ]; then
  echo "Installing server Python dependencies..."
  pip install -r "$PROJECT_ROOT/server/requirements.txt" 2>/dev/null || \
    pip install -r "$PROJECT_ROOT/server/requirements.txt" --break-system-packages 2>/dev/null || \
    echo "WARNING: Failed to install server dependencies."
else
  echo "No server/requirements.txt found — skipping server deps."
fi

# ─── Install Node dependencies ───────────────────────────────────
echo ""
echo "Installing Node dependencies..."

if [ -f "$PROJECT_ROOT/client/package.json" ]; then
  echo "Installing client dependencies..."
  (cd "$PROJECT_ROOT/client" && npm install)
else
  echo "No client/package.json found — skipping client deps."
fi

if [ -f "$PROJECT_ROOT/package.json" ]; then
  echo "Installing root dependencies..."
  (cd "$PROJECT_ROOT" && npm install)
else
  echo "No root package.json found — skipping root deps."
fi

# ─── Create directory structure ───────────────────────────────────
echo ""
echo "Ensuring directory structure..."
mkdir -p "$PROJECT_ROOT/raw"
mkdir -p "$PROJECT_ROOT/scenes"
mkdir -p "$PROJECT_ROOT/config"

# ─── Summary ─────────────────────────────────────────────────────
echo ""
echo "=== Bootstrap complete ==="
echo ""
echo "Next steps:"
echo "  1. Place raw video in raw/<scene_id>.mp4"
echo "  2. Run: scripts/process.sh <scene_id>"
echo ""
