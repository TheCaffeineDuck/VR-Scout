# VR Scout v3 — Complete Design Plan
**Architecture, Pipeline, UI/UX, Observability & Build Order**
*March 15, 2026 — Revised from v2 with full UI specification, pipeline observability, error handling, and validation gates*

---

## Table of Contents

1. [Project Goals & Product Architecture](#1-project-goals--product-architecture)
2. [History & What Not To Repeat](#2-history--what-not-to-repeat)
3. [The Complete Tech Stack](#3-the-complete-tech-stack)
4. [The Full Pipeline](#4-the-full-pipeline)
5. [Pipeline Observability & Error Handling](#5-pipeline-observability--error-handling)
6. [UI/UX Design](#6-uiux-design)
7. [Renderer Architecture](#7-renderer-architecture)
8. [VR Delivery Strategy](#8-vr-delivery-strategy)
9. [Performance Budgets & Constraints](#9-performance-budgets--constraints)
10. [Custom Code You Own](#10-custom-code-you-own)
11. [Build Order](#11-build-order)
12. [Known Failure Modes & User-Facing Error Map](#12-known-failure-modes--user-facing-error-map)
13. [A/B Test Protocol](#13-ab-test-protocol)
14. [Future Roadmap](#14-future-roadmap)
15. [References](#15-references)
16. [Appendices](#16-appendices)

---

## 1. Project Goals & Product Architecture

### Primary Goal

Create an end-to-end system for converting real-world video footage into photorealistic 3D Gaussian Splat scenes, viewable in a browser with WebXR VR support. Target use case: architectural and real estate visualization.

### Two Products, One Codebase (Monolith-First)

Build a single application containing both the processing pipeline and the viewer. The viewer is an extractable component with a clean interface boundary — it never calls up into the pipeline. When a standalone embeddable viewer is needed for end users, extract it as a separate package.

**Product 1 — VR Scout Studio (the monolith)**
The full application for processing and viewing splats. Includes:
- Video upload with chunked transfer and progress reporting
- Pipeline orchestration with per-step status, logs, and error recovery
- COLMAP QA tools (camera path visualization, registration heatmap)
- Floor plane visualization and manual adjustment
- gsplat training management with live metrics (loss, PSNR, iteration)
- Post-training cleanup integration (3dgsconverter)
- SPZ conversion and export with validation
- Integrated viewer for QA and preview
- WebXR VR mode for immersive review

**Product 2 — VR Scout Viewer (extracted component)**
A self-contained React component (or standalone JS bundle) that takes a scene config and renders it. Designed to be embedded in any website. Interface contract:

```typescript
interface ViewerProps {
  sceneConfig: SceneConfig;
  enableVR?: boolean;
  enableControls?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;  // SPZ download progress
}
```

The viewer knows nothing about COLMAP, training, or the pipeline. It receives a URL and renders.

**The boundary rule:** If code references the FastAPI server, job queue, file system paths, or training parameters, it belongs to Product 1. If code only needs an SPZ URL, alignment data, and renderer config, it belongs to the viewer component. This boundary must be enforced from day one.

### Constraints (non-negotiable)

- 100% open-source toolchain (no Luma AI, no Postshot, no non-commercial licensed tools)
- Capture device: DJI Osmo Pocket 3
- Training hardware: MSI Pulse 16 AI, RTX 4070, Ubuntu/WSL
- Viewer stack: React 19, React Three Fiber, Three.js, Vite
- Desktop-first product with VR as a feature
- Quest 3 compatibility for portable/standalone VR mode

---

## 2. History & What Not To Repeat

Three prior iterations were abandoned. This section documents why.

### Iteration 1 — Custom WebGPU Shader
**Why it failed:** WebGPU+WebXR bindings were not available on Quest Browser (still aren't as of March 2026). Building a custom WebGPU renderer without a stable WebXR target was premature.

**Status now:** Desktop WebGPU is fully shipped in all major browsers as of November 2025. WebGPU+WebXR on desktop Chrome is available behind flags (Chrome 135+). Quest Browser still does not support it. A custom WebGPU renderer is viable for the desktop tier in the future — but only with a WebGL2 fallback, and only after the product thesis is validated.

### Iteration 2 — Triangle Splats
**Why it failed:** Triangle-based splatting is not competitive with standard 3DGS for real-world scene reconstruction. No production toolchain exists for triangle splats from video input.

**Do not revisit.**

### Iteration 3 — Standard Splats with SPZ (Spark renderer)
**Status:** Mostly correct direction. The Spark renderer and SPZ format are sound choices. Problems were:
- Using Nerfstudio as the training interface instead of calling gsplat directly
- Using the spz Python library which has a known BoundingBox circular import bug
- Insufficient training iterations with default ADC densification
- No gravity/floor alignment pipeline
- Missing orchestration scripts
- Camera model and matcher settings need A/B testing against existing footage (see Section 13)

**This is the base to build from — not abandon.**

### Pre-Build Prerequisite: Resolve Scene Ambiguity

Before any phase begins, resolve the `indoor_library` / `library_area` ambiguity. These two scene references may be the same scene at different pipeline stages. Check source footage files and COLMAP databases. Consolidate into a single entry in the scene registry. Phase 1 loads existing SPZ files — loading the wrong file or one from an unknown pipeline state makes validation results meaningless.

**Action:** SSH into WSL, compare `scenes/indoor_library/` and `scenes/library_area/` directories. Check creation dates, frame counts, and COLMAP database image paths. Document the finding. Delete or rename the duplicate.

---

## 3. The Complete Tech Stack

### Capture

| Component | Tool | Notes |
|-----------|------|-------|
| Camera | DJI Osmo Pocket 3 | 4K/30fps, locked exposure/WB, gimbal stabilization |
| Settings | Standard color profile | Never D-Log or HLG — inconsistent exposure causes floaters |
| Extraction | ffmpeg | 2 FPS, scene-change filter to remove near-duplicates |

### Structure from Motion (SfM)

| Component | Tool | Notes |
|-----------|------|-------|
| SfM | COLMAP | Feature extraction + matching |
| Camera model | **A/B test required** | SIMPLE_RADIAL vs OPENCV — see Section 13 |
| Matcher | **A/B test required** | Sequential vs exhaustive — see Section 13 |
| Single camera flag | --single_camera 1 | All video frames share one camera intrinsic |
| Mapper | See note below | Incremental or global depending on install |
| Alignment | colmap model_orientation_aligner | Manhattan world assumption — run after reconstruction, before training |

> **GLOMAP Status (March 2026):** The standalone GLOMAP repository was archived on March 9, 2026, with functionality migrated into COLMAP. The exact COLMAP subcommand for global SfM needs verification against your installed version. If your COLMAP build includes the merged global mapper, use that. If not, fall back to `colmap mapper` (incremental). **Verify on your actual install before writing the orchestration script.**

### Training

| Component | Tool | Notes |
|-----------|------|-------|
| Trainer | **gsplat (direct)** | github.com/nerfstudio-project/gsplat, Apache 2.0 |
| Strategy | MCMC densification | More efficient than default ADC; adapts Gaussian count principally |
| Key flags | --use_bilateral_grid | Compensates for video auto-exposure shifts |
| Iterations | 30,000 (target) | See justification below |
| SH degree | **1 (default), configurable per-scene** | SH1 for diffuse interiors; allow SH2/3 override for scenes with specular surfaces |

> **Why gsplat direct instead of Nerfstudio?** Nerfstudio wraps gsplat but abstracts away critical flags and uses non-optimal densification defaults. Call gsplat directly for full control.

> **Correct gsplat invocation:**
> ```bash
> python examples/simple_trainer.py mcmc \
>   --data_dir ./scene \
>   --result_dir ./output \
>   --use_bilateral_grid \
>   --max_steps 30000
> ```
> Note: It is `python examples/simple_trainer.py`, NOT `python -m gsplat.simple_trainer`. The `min_opacity` parameter in MCMCStrategy defaults to 0.005, which handles transparent Gaussian culling automatically — no separate --cull-alpha-thresh flag needed.

> **Why 30K iterations is now sufficient:** Iteration 3 used Nerfstudio's default ADC (Adaptive Density Control) strategy at 30K steps and produced moderate quality. MCMC densification uses stochastic exploration via Langevin dynamics, avoiding the local minima traps that cause ADC to stall around 25-30K steps. MCMC at 30K steps produces meaningfully better results than ADC at 30K steps.

> **Evaluate before locking in:** gsplat added PPIPS (January 2026) as an alternative to bilateral grid for compensating training views, and NVIDIA 3DGUT (April 2025) was integrated. Both may offer better alternatives — test on a scene before committing.

### Post-Training Cleanup

| Component | Tool | Notes |
|-----------|------|-------|
| Manual cleanup | SuperSplat | superspl.at/editor (browser-based) or CLI, MIT |
| Automated culling | **3dgsconverter** | Replaces Clean-GS and custom cull_floaters.py |
| Target Gaussian count | **500K-800K** | Quest 3 standalone ceiling; 1M+ crashes mobile browsers |

> **Simplified cleanup pipeline:** 3dgsconverter includes built-in GPU-accelerated Statistical Outlier Removal (--sor_intensity), opacity-based culling (--min_opacity), density filtering (--density_sensitivity), and bounding box cropping (--bbox). This single tool replaces the planned cull_floaters.py script and the Clean-GS dependency. One command handles conversion AND cleanup:
> ```bash
> 3dgsconverter -i trained.ply -o scene.spz \
>   --min_opacity 5 --sor_intensity 3 \
>   --compression_level 5
> ```

### Compressed Format: SPZ

**Decision: SPZ. This is final. Stop evaluating SOG.**

Rationale:

| Factor | SPZ | SOG | Decision Driver |
|--------|-----|-----|-----------------|
| Compression | ~10x (12MB for 500K scene) | ~15-20x (6-8MB) | 12MB vs 6MB is negligible on modern connections |
| SH handling | Per-Gaussian 8-bit quantized, gzip lossless | K-means palette clustering (lossy) | SPZ preserves per-Gaussian SH; SOG can band on uniform architectural surfaces |
| Spark support | Native, SH bugs fixed in v0.1.5 | Supported in 0.1 and 2.0 | SPZ is the primary tested path with Spark |
| Standards track | Proposed Khronos glTF compression extension | PlayCanvas open spec | SPZ has strongest trajectory (though compression spec not yet ratified) |
| Quest 3 proven | Yes (Scaniverse) | Via PlayCanvas only | SPZ proven on target device |
| Ecosystem | Renderer-agnostic | PlayCanvas-centric | SPZ has broader adoption across renderers |
| SPZ v2.0.0 | Improved 10-bit quaternion encoding for thin features | N/A | Directly addresses architectural artifacts on railings/door frames |

**Conversion tool: 3dgsconverter** — replaces the spz Python library (which has the BoundingBox circular import bug). Supports PLY to SPZ with GPU acceleration via Taichi.

**Always keep PLY originals** as the archival/editing format. SPZ to PLY round-trips are lossless.

> **Coordinate system note:** SPZ uses RUB/OpenGL convention. PLY uses RDF. Always specify coordinate system conversion in 3dgsconverter or splats will be flipped/rotated.

> **Standardization nuance (accurate as of March 2026):** The Khronos KHR_gaussian_splatting base extension reached release candidate status in February 2026, with ratification expected Q2 2026. The compression extension (KHR_gaussian_splatting_compression_spz) has been proposed but is NOT yet ratified. Qualcomm's L-GSC is a competing proposal. SPZ has the strongest position but calling it "the official glTF compression format" is premature.

### Renderer

| Component | Tool | Notes |
|-----------|------|-------|
| Primary | **Spark** | sparkjsdev/spark, MIT, WebGL2 |
| Version | **Evaluate Spark 2.0-preview** before committing to 0.1.10 | 2.0 includes LOD octree, improved sorting, SparkXr |
| Scene graph | React Three Fiber | R3F v9+ |
| 3D library | Three.js | Latest stable |
| Build tool | Vite | Latest stable |
| Format support | PLY, SPZ, SPLAT, KSPLAT, SOG | All major formats via Spark |
| SH support | Degrees 0-2 (0.1.x), TBD for 2.0 | Sufficient for SH1 training targets |

> **Spark 2.0-preview evaluation required:** Spark 2.0 introduces LOD splat tree construction via voxel octrees, world-space accumulation with 32-bit precision centers, independent per-renderer sort workers, and SparkXr replacing VRButton. The LOD system is exactly what the original plan put in Phase 6 as custom zone-manager code. If Spark 2.0 delivers this out of the box, the zone manager becomes configuration rather than custom code. See Section 13 for concrete evaluation criteria.

### Backend / Pipeline Server

| Component | Tool | Notes |
|-----------|------|-------|
| API server | FastAPI (Python) | Existing; needs security fixes |
| Job management | SQLite (immediate) | Replace jobs.json from day one — no deferral |
| File handling | Structured output directories | `scenes/{id}/frames/`, `logs/`, `sparse/`, `aligned/`, `output/` |
| Progress reporting | WebSocket from FastAPI to React UI | Structured JSON events per pipeline step |
| Log capture | Per-step log files | `scenes/{id}/logs/step_{N}_{name}.log` |

---

## 4. The Full Pipeline

### Pipeline Flow Diagram

```
DJI Osmo Pocket 3 (4K/30fps, locked exposure, gimbal)
          |
          v
    [Step 0] Pre-flight checks
    Verify: CUDA_HOME, nvidia-smi, disk space, conda env
    GATE: All checks pass → proceed. Any fail → abort with specific error.
          |
          v
    [Step 1] Upload + frame extraction
    Chunked upload with progress bar
    ffmpeg: fps=2, scene-change dedup (gt(scene,0.1)), -q:v 2
    GATE: Frame count >= 150. If < 150 → warn "insufficient frames."
    Output: scenes/{id}/frames/frame_00001.jpg ... frame_NNNNN.jpg
          |
          v
    [Step 2] COLMAP feature extraction
    --camera_model [A/B test result]
    --single_camera 1
    GATE: Features extracted for all images (COLMAP logs feature count per image).
          |
          v
    [Step 3] COLMAP matching
    [sequential or exhaustive — A/B test result]
    Timeout: 60 min for exhaustive (300 frames). Warn at 2x expected.
          |
          v
    [Step 4] COLMAP/GLOMAP mapping
    [verify command against installed version]
    GATE: Check sparse/0/ exists. If multiple models (sparse/0/, sparse/1/),
          select largest by image count, warn user of split.
    GATE: Registration rate >= 90%. If < 90% → warn with suggestion.
          If < 50% → block training with "re-shoot" recommendation.
    Output: scenes/{id}/sparse/0/
          |
          v
    [Step 5] Gravity alignment
    colmap model_orientation_aligner (Manhattan world assumption)
    GATE: Compare input/output camera poses. If transform is identity
          (no Manhattan directions detected), warn user that auto-alignment
          failed and manual alignment will be needed.
    Output: scenes/{id}/aligned/
          |
          v
    [Step 6] Validation checkpoint (validate_colmap.py)
    Report: registration rate, reprojection error, point cloud density,
            camera model used, image count, estimated scene scale.
    UI: Display validation report. User confirms "Proceed to training" or
        adjusts settings and re-runs Steps 2-5.
          |
          v
    [Step 7] gsplat training
    python examples/simple_trainer.py mcmc
    --use_bilateral_grid --max_steps 30000
    LIVE METRICS: Capture stdout every 100 iterations → WebSocket
    Report: iteration, loss, PSNR, Gaussian count, elapsed time, ETA
    GATE: Training completes without CUDA OOM or NaN loss.
          If OOM → suggest --data_factor 2.
          If NaN loss → suggest reducing LR (multiply by 0.1).
    Output: scenes/{id}/output/point_cloud.ply
          |
          v
    [Step 8] Cleanup + SPZ conversion (3dgsconverter)
    PLY → SPZ with --sor_intensity 3 --min_opacity 5
    Coordinate system: RDF → RUB
    GATE: Validate output SPZ — check file exists, size > 0,
          Gaussian count within budget (500K-800K for Quest 3),
          SH degree preserved in metadata.
          If Gaussian count > 800K → warn, suggest increasing --sor_intensity.
          If SH degree 0 when SH1 expected → error, conversion stripped SH data.
    Output: scenes/{id}/output/scene.spz
          |
          v
    [Step 9] QA Review (UI-driven, not automated)
    Camera path visualization (3D view of COLMAP camera positions)
    Floor plane overlay with manual adjustment gizmo
    Scene preview in integrated viewer
    User approves or adjusts alignment → regenerate alignment.json
    Output: scenes/{id}/output/alignment.json
          |
          v
    [Step 10] Viewer loads scene.spz + alignment.json
    Spark renderer (WebGL2)
    WebXR session → VR mode
```

### Key Pipeline Change: Pre-Training Alignment

The single most important architectural change from prior plans. COLMAP's `model_orientation_aligner` uses vanishing point detection to determine gravity axis and major horizontal axes via Manhattan world assumption. For architectural interiors, this assumption is strong. Running alignment before training means:

1. Gaussians train in a gravity-correct coordinate system from the start
2. Training convergence improves (no wasted capacity learning arbitrary rotations)
3. The custom `align_scene.py` becomes a refinement/QA tool, not the primary mechanism
4. The pipeline UI can visualize camera positions from the sparse reconstruction to verify alignment

Additionally, the DJI Osmo Pocket 3 records IMU/gravity data in EXIF metadata. A future enhancement can extract this and feed it to `colmap model_aligner` for IMU-derived gravity priors.

### Orchestration Script (process.sh)

This is the spine of the system. It must be rebuilt and version-controlled from day one.

**Critical design requirements:**
- Each step writes structured status to a JSON file (`scenes/{id}/status.json`) that FastAPI polls
- Each step's stdout/stderr is captured to `scenes/{id}/logs/step_{N}_{name}.log`
- Exit codes are captured per step, not just for the whole script
- GPU pre-flight check at the top
- gsplat data directory structure is explicitly set up (symlinks or flags)
- Scene-change dedup filter is included in ffmpeg command
- Multi-model COLMAP output is handled (select largest, warn user)

```bash
#!/bin/bash
set -uo pipefail
# NOTE: -e is NOT set globally — we capture exit codes per step instead

SCENE_ID=$1
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW_VIDEO="$PROJECT_ROOT/raw/$SCENE_ID.mp4"
SCENE_DIR="$PROJECT_ROOT/scenes/$SCENE_ID"
FRAMES_DIR="$SCENE_DIR/frames"
DB_PATH="$SCENE_DIR/db.db"
SPARSE_DIR="$SCENE_DIR/sparse"
ALIGNED_DIR="$SCENE_DIR/aligned"
OUTPUT_DIR="$SCENE_DIR/output"
LOGS_DIR="$SCENE_DIR/logs"
STATUS_FILE="$SCENE_DIR/status.json"

# Path to gsplat repo clone (not pip install — we need examples/simple_trainer.py)
GSPLAT_DIR="$PROJECT_ROOT/tools/gsplat"

mkdir -p "$FRAMES_DIR" "$SPARSE_DIR" "$ALIGNED_DIR" "$OUTPUT_DIR" "$LOGS_DIR"

# ─── Status Reporting ───────────────────────────────────────────────
write_status() {
  local step_num=$1
  local step_name=$2
  local status=$3
  local message=${4:-""}
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat > "$STATUS_FILE" <<EOF
{
  "scene_id": "$SCENE_ID",
  "current_step": $step_num,
  "step_name": "$step_name",
  "status": "$status",
  "message": "$message",
  "timestamp": "$timestamp",
  "pid": $$
}
EOF
}

run_step() {
  local step_num=$1
  local step_name=$2
  local log_file="$LOGS_DIR/step_${step_num}_${step_name}.log"
  shift 2

  write_status "$step_num" "$step_name" "running"
  echo "=== Step $step_num: $step_name ===" | tee "$log_file"

  # Run command, capture exit code, tee to log
  "$@" >> "$log_file" 2>&1
  local exit_code=$?

  if [ $exit_code -ne 0 ]; then
    write_status "$step_num" "$step_name" "failed" "Exit code $exit_code. See logs/step_${step_num}_${step_name}.log"
    echo "FAILED: Step $step_num ($step_name) exited with code $exit_code"
    echo "Log: $log_file"
    exit $exit_code
  fi

  write_status "$step_num" "$step_name" "completed"
  return 0
}

# ─── Step 0: Pre-flight Checks ─────────────────────────────────────
write_status 0 "preflight" "running"

PREFLIGHT_ERRORS=""

if [ ! -f "$RAW_VIDEO" ]; then
  PREFLIGHT_ERRORS+="Video file not found: $RAW_VIDEO\n"
fi

if [ -z "${CUDA_HOME:-}" ]; then
  PREFLIGHT_ERRORS+="CUDA_HOME is not set. Run: export CUDA_HOME=/usr/local/cuda-11.8\n"
fi

if ! command -v nvidia-smi &> /dev/null; then
  PREFLIGHT_ERRORS+="nvidia-smi not found. GPU driver may not be installed.\n"
elif ! nvidia-smi &> /dev/null; then
  PREFLIGHT_ERRORS+="nvidia-smi failed. GPU may not be available.\n"
fi

if ! command -v colmap &> /dev/null; then
  PREFLIGHT_ERRORS+="colmap not found in PATH.\n"
fi

if ! command -v 3dgsconverter &> /dev/null; then
  PREFLIGHT_ERRORS+="3dgsconverter not found. Install: pip install git+https://github.com/francescofugazzi/3dgsconverter.git\n"
fi

if [ ! -f "$GSPLAT_DIR/examples/simple_trainer.py" ]; then
  PREFLIGHT_ERRORS+="gsplat repo not found at $GSPLAT_DIR. Clone: git clone https://github.com/nerfstudio-project/gsplat.git $GSPLAT_DIR\n"
fi

DISK_FREE_GB=$(df -BG "$SCENE_DIR" | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$DISK_FREE_GB" -lt 20 ]; then
  PREFLIGHT_ERRORS+="Low disk space: ${DISK_FREE_GB}GB free (need 20GB+).\n"
fi

if [ -n "$PREFLIGHT_ERRORS" ]; then
  write_status 0 "preflight" "failed" "$PREFLIGHT_ERRORS"
  echo -e "Pre-flight check failed:\n$PREFLIGHT_ERRORS"
  exit 1
fi

write_status 0 "preflight" "completed"
echo "Pre-flight checks passed."

# ─── Step 1: Frame Extraction ──────────────────────────────────────
run_step 1 "frame_extraction" \
  ffmpeg -i "$RAW_VIDEO" \
    -vf "fps=2,select='gt(scene\,0.1)'" \
    -vsync vfr -q:v 2 \
    "$FRAMES_DIR/frame_%05d.jpg"

# Validation gate: frame count
FRAME_COUNT=$(ls "$FRAMES_DIR"/*.jpg 2>/dev/null | wc -l)
echo "Extracted $FRAME_COUNT frames."

if [ "$FRAME_COUNT" -lt 50 ]; then
  write_status 1 "frame_extraction" "failed" \
    "Only $FRAME_COUNT frames extracted. Minimum 50 required. Check video file or reduce scene-change threshold."
  exit 1
elif [ "$FRAME_COUNT" -lt 150 ]; then
  write_status 1 "frame_extraction" "warning" \
    "$FRAME_COUNT frames extracted. 150+ recommended for good COLMAP registration. Consider re-shooting with slower movement."
fi

# ─── Step 2: COLMAP Feature Extraction ─────────────────────────────
# Camera model: replace SIMPLE_RADIAL with A/B test winner
run_step 2 "feature_extraction" \
  colmap feature_extractor \
    --ImageReader.camera_model SIMPLE_RADIAL \
    --ImageReader.single_camera 1 \
    --database_path "$DB_PATH" \
    --image_path "$FRAMES_DIR"

# ─── Step 3: Matching ──────────────────────────────────────────────
# Matcher: replace with A/B test winner (exhaustive_matcher or sequential_matcher)
run_step 3 "matching" \
  colmap exhaustive_matcher \
    --database_path "$DB_PATH"

# ─── Step 4: Mapping ──────────────────────────────────────────────
# Use incremental mapper. If GLOMAP is available, substitute here.
run_step 4 "mapping" \
  colmap mapper \
    --database_path "$DB_PATH" \
    --image_path "$FRAMES_DIR" \
    --output_path "$SPARSE_DIR"

# Validation gate: select best model if multiple exist
BEST_MODEL=""
BEST_COUNT=0
for MODEL_DIR in "$SPARSE_DIR"/*/; do
  if [ -f "$MODEL_DIR/images.bin" ]; then
    # Count registered images via file size heuristic (or parse with Python)
    IMG_SIZE=$(stat -c%s "$MODEL_DIR/images.bin" 2>/dev/null || echo "0")
    if [ "$IMG_SIZE" -gt "$BEST_COUNT" ]; then
      BEST_COUNT=$IMG_SIZE
      BEST_MODEL=$MODEL_DIR
    fi
  fi
done

if [ -z "$BEST_MODEL" ]; then
  write_status 4 "mapping" "failed" "No COLMAP models produced. Check frame quality and overlap."
  exit 1
fi

MODEL_COUNT=$(ls -d "$SPARSE_DIR"/*/ 2>/dev/null | wc -l)
if [ "$MODEL_COUNT" -gt 1 ]; then
  write_status 4 "mapping" "warning" \
    "COLMAP split scene into $MODEL_COUNT models. Using largest: $BEST_MODEL. Scene may have disconnected regions."
fi

echo "Using COLMAP model: $BEST_MODEL"

# ─── Step 5: Gravity Alignment ────────────────────────────────────
run_step 5 "gravity_alignment" \
  colmap model_orientation_aligner \
    --image_path "$FRAMES_DIR" \
    --input_path "$BEST_MODEL" \
    --output_path "$ALIGNED_DIR"

# Validation gate: check if alignment actually changed anything
# (identity transform = alignment failed silently)
# This is checked more thoroughly by validate_colmap.py in step 6

# ─── Step 6: Validation ───────────────────────────────────────────
run_step 6 "validation" \
  python "$PROJECT_ROOT/scripts/validate_colmap.py" \
    --sparse_path "$ALIGNED_DIR" \
    --original_sparse_path "$BEST_MODEL" \
    --image_path "$FRAMES_DIR" \
    --output_json "$SCENE_DIR/validation_report.json" \
    --min_registration_rate 0.9

# The validation script writes a JSON report. FastAPI reads this and
# presents it in the UI. The user decides whether to proceed.
# For automated runs, check exit code (0 = pass, 1 = warn, 2 = block).

VALIDATION_EXIT=$?
if [ $VALIDATION_EXIT -eq 2 ]; then
  write_status 6 "validation" "blocked" \
    "Registration rate below 50%. Re-shoot recommended. See validation_report.json."
  exit 1
fi

# ─── PAUSE: User confirmation required via UI ──────────────────────
# The pipeline pauses here. FastAPI serves the validation report.
# The UI shows camera path visualization, registration stats, alignment check.
# User clicks "Proceed to Training" or adjusts settings and re-runs Steps 2-5.
write_status 6 "validation" "awaiting_confirmation" \
  "Validation complete. Review report and confirm to proceed."

echo "Pipeline paused. Awaiting user confirmation to proceed to training."
echo "Validation report: $SCENE_DIR/validation_report.json"

# In practice, FastAPI will re-invoke the script from step 7 onwards
# after user confirmation. For now, this is a manual gate.
# To continue: ./process.sh $SCENE_ID --resume-from 7

# ─── Step 7: gsplat Training ──────────────────────────────────────
# Set up data directory structure that gsplat expects
# gsplat simple_trainer expects: data_dir/images/ and data_dir/sparse/0/
GSPLAT_DATA_DIR="$SCENE_DIR/gsplat_input"
mkdir -p "$GSPLAT_DATA_DIR/sparse/0"
ln -sfn "$FRAMES_DIR" "$GSPLAT_DATA_DIR/images"
ln -sfn "$ALIGNED_DIR/cameras.bin" "$GSPLAT_DATA_DIR/sparse/0/cameras.bin"
ln -sfn "$ALIGNED_DIR/images.bin" "$GSPLAT_DATA_DIR/sparse/0/images.bin"
ln -sfn "$ALIGNED_DIR/points3D.bin" "$GSPLAT_DATA_DIR/sparse/0/points3D.bin"

write_status 7 "training" "running" "Starting gsplat MCMC training (30,000 iterations)"

cd "$GSPLAT_DIR"

# Training with stdout capture for live metrics
# gsplat prints metrics every 100 steps to stdout
# We tee to log and a metrics FIFO that FastAPI can read
python examples/simple_trainer.py mcmc \
  --data_dir "$GSPLAT_DATA_DIR" \
  --result_dir "$OUTPUT_DIR" \
  --use_bilateral_grid \
  --max_steps 30000 \
  2>&1 | tee "$LOGS_DIR/step_7_training.log" | \
  grep --line-buffered "Step\|PSNR\|loss\|num_gaussians" > "$SCENE_DIR/training_metrics.log" &

TRAIN_PID=$!
wait $TRAIN_PID
TRAIN_EXIT=$?

cd "$PROJECT_ROOT"

if [ $TRAIN_EXIT -ne 0 ]; then
  # Check for common failure patterns
  if grep -q "CUDA out of memory" "$LOGS_DIR/step_7_training.log"; then
    write_status 7 "training" "failed" \
      "CUDA out of memory. Try: re-run with --data_factor 2 to halve resolution."
  elif grep -q "nan" "$LOGS_DIR/step_7_training.log"; then
    write_status 7 "training" "failed" \
      "Training diverged (NaN loss). Try: reduce learning rate by 0.1x."
  else
    write_status 7 "training" "failed" "Training failed with exit code $TRAIN_EXIT. Check step_7_training.log."
  fi
  exit $TRAIN_EXIT
fi

write_status 7 "training" "completed" "Training finished. Output: $OUTPUT_DIR/point_cloud.ply"

# ─── Step 8: Cleanup + SPZ Conversion ─────────────────────────────
run_step 8 "conversion" \
  3dgsconverter \
    -i "$OUTPUT_DIR/point_cloud.ply" \
    -o "$OUTPUT_DIR/scene.spz" \
    --min_opacity 5 \
    --sor_intensity 3 \
    --compression_level 5

# Validation gate: verify output SPZ
if [ ! -f "$OUTPUT_DIR/scene.spz" ]; then
  write_status 8 "conversion" "failed" "scene.spz not created. Check 3dgsconverter logs."
  exit 1
fi

SPZ_SIZE=$(stat -c%s "$OUTPUT_DIR/scene.spz")
if [ "$SPZ_SIZE" -lt 1000 ]; then
  write_status 8 "conversion" "failed" "scene.spz is suspiciously small (${SPZ_SIZE} bytes). Conversion may have failed silently."
  exit 1
fi

SPZ_SIZE_MB=$((SPZ_SIZE / 1048576))
if [ "$SPZ_SIZE_MB" -gt 50 ]; then
  write_status 8 "conversion" "warning" \
    "scene.spz is ${SPZ_SIZE_MB}MB — exceeds Quest 3 budget of 50MB. Consider increasing --sor_intensity or --min_opacity."
fi

write_status 8 "conversion" "completed" "scene.spz created (${SPZ_SIZE_MB}MB)."

# ─── Step 9: Generate default alignment.json ───────────────────────
# Since model_orientation_aligner ran pre-training, the default alignment
# is identity. The UI will allow manual adjustment and overwrite this file.
cat > "$OUTPUT_DIR/alignment.json" <<EOF
{
  "transform": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  "source": "identity (pre-training alignment applied)",
  "scene_id": "$SCENE_ID",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

write_status 9 "alignment" "awaiting_review" \
  "Pipeline complete. Open QA review to verify alignment and visual quality."

echo ""
echo "========================================"
echo "  Pipeline complete for: $SCENE_ID"
echo "  SPZ: $OUTPUT_DIR/scene.spz (${SPZ_SIZE_MB}MB)"
echo "  Alignment: $OUTPUT_DIR/alignment.json"
echo "  Logs: $LOGS_DIR/"
echo "  Open the UI to review scene quality."
echo "========================================"
```

---

## 5. Pipeline Observability & Error Handling

### 5.1 Status File Protocol

Every pipeline run maintains a single `scenes/{id}/status.json` file that is the source of truth for the UI. FastAPI polls this file (or watches via inotify) and pushes updates to the React UI over WebSocket.

**Status file schema:**

```json
{
  "scene_id": "indoor_library",
  "current_step": 7,
  "step_name": "training",
  "status": "running | completed | failed | warning | blocked | awaiting_confirmation | awaiting_review",
  "message": "Human-readable status message",
  "timestamp": "2026-03-15T10:30:00Z",
  "pid": 12345
}
```

**Status values and their UI treatment:**

| Status | UI Indicator | User Action |
|--------|-------------|-------------|
| `running` | Spinning indicator + step name + elapsed time | Wait (or cancel) |
| `completed` | Green checkmark | Auto-advance to next step |
| `failed` | Red X + error message + "View Log" button | Read suggestion, fix, retry |
| `warning` | Yellow triangle + message | Acknowledge and continue, or fix |
| `blocked` | Red stop + message | Must fix before continuing |
| `awaiting_confirmation` | Blue pause + validation report | Review data, click "Proceed" or "Re-run" |
| `awaiting_review` | Blue pause + viewer loaded | Adjust alignment, approve scene |

### 5.2 Per-Step Log Capture

Every pipeline step writes to its own log file: `scenes/{id}/logs/step_{N}_{name}.log`. The UI provides a "View Log" button for each step that opens the log in a scrollable panel (last 200 lines shown, with "Load More" for full log).

Log files are plain text (stdout + stderr merged). They are never deleted automatically — the user can clear them manually or they are overwritten on re-run.

### 5.3 Training Metrics Stream

gsplat training is the longest step (30-120 minutes depending on scene size and iteration count). The UI must show live progress, not just "running."

**Capture method:** gsplat's `simple_trainer.py` prints a line every N iterations with metrics. The orchestration script tees stdout to a `training_metrics.log` file. FastAPI tails this file and sends parsed metrics over WebSocket.

**Metrics to capture and display:**

| Metric | Source | UI Display |
|--------|--------|------------|
| Iteration | stdout | Progress bar (X / 30,000) + percentage |
| PSNR | stdout | Line chart (PSNR vs iteration) — key quality signal |
| Loss | stdout | Line chart (loss vs iteration) — should decrease monotonically |
| Gaussian count | stdout | Numeric display — should stabilize after ~10K iterations with MCMC |
| Elapsed time | system clock | "Running for 23m" |
| ETA | computed (elapsed / iteration × remaining) | "~47m remaining" |
| GPU memory | nvidia-smi poll (every 30s) | Bar indicator — warns if > 90% utilization |

**Training anomaly detection (FastAPI-side):**

| Anomaly | Detection | UI Alert |
|---------|-----------|----------|
| Stalled training | No new log lines for > 5 minutes | Yellow warning: "Training appears stalled. GPU may be blocked." |
| Loss spike | Loss increases by > 50% over 500 iterations | Yellow warning: "Loss spiked. Training may be unstable." |
| NaN loss | "nan" appears in loss value | Red error: "Training diverged. Try reducing learning rate." |
| PSNR plateau | PSNR doesn't increase for > 5000 iterations | Info: "Quality has plateaued. Consider stopping early." |
| GPU OOM | "CUDA out of memory" in log | Red error: "GPU out of memory. Re-run with --data_factor 2." |

### 5.4 Hang Detection

External tools (COLMAP, gsplat, 3dgsconverter) can hang without crashing. The orchestration layer must detect this.

**Per-step expected durations (for 300 frames, RTX 4070):**

| Step | Expected Duration | Warn Threshold (3×) | Kill Threshold (10×) |
|------|-------------------|---------------------|---------------------|
| 0. Pre-flight | < 5s | 15s | 50s |
| 1. Frame extraction | 30s - 2min | 6min | 20min |
| 2. Feature extraction | 2-10min | 30min | 100min |
| 3. Matching (exhaustive) | 5-30min | 90min | 300min |
| 3. Matching (sequential) | 1-5min | 15min | 50min |
| 4. Mapping | 5-60min | 180min | 600min |
| 5. Gravity alignment | < 30s | 90s | 300s |
| 6. Validation | < 10s | 30s | 100s |
| 7. Training (30K) | 30-120min | 360min | 720min |
| 8. Conversion | 1-5min | 15min | 50min |

**Implementation:** FastAPI tracks the PID and start time for each step. A background task checks every 30 seconds:
- If elapsed > warn threshold: push WebSocket warning ("Step X has been running longer than expected")
- If elapsed > kill threshold: push WebSocket error ("Step X appears hung. Offer: Kill and retry, or Continue waiting")
- Additionally, monitor CPU/GPU activity of the PID. If CPU usage is 0% for > 60 seconds, the process is likely hung regardless of elapsed time.

### 5.5 Validation Gates

Validation gates are checkpoints between pipeline steps that prevent wasting time on doomed downstream operations.

| Gate Location | Check | Pass Criteria | Fail Action |
|---------------|-------|---------------|-------------|
| After Step 1 (frames) | Frame count | >= 150 (warn at 50-149, block at < 50) | "Insufficient frames. Re-shoot or lower scene-change threshold." |
| After Step 4 (mapping) | Model count | Exactly 1 model preferred | If > 1: warn + select largest. If 0: block. |
| After Step 4 (mapping) | Registration rate | >= 90% (warn at 50-89%, block at < 50%) | "Low registration. Check overlap." / "Re-shoot recommended." |
| After Step 5 (alignment) | Transform delta | Non-identity transform | If identity: warn "Auto-alignment failed. Manual alignment required." |
| After Step 6 (validation) | Reprojection error | < 1.0 pixel mean | If > 1.0: warn "High reprojection error. Training quality may suffer." |
| After Step 7 (training) | Final PSNR | > 20 dB | If < 20: warn "Low quality. Consider more iterations or better footage." |
| After Step 8 (conversion) | SPZ file size | > 1KB and < 50MB | If > 50MB: warn "Exceeds Quest 3 budget." If < 1KB: block. |
| After Step 8 (conversion) | Gaussian count | 500K-800K target | If > 1M: warn. If < 100K: warn "Scene may be too sparse." |

### 5.6 Asset Versioning & Backup

Pipeline outputs (PLY, SPZ, alignment.json, logs, validation reports) are stored in dated subdirectories to prevent accidental loss:

```
scenes/indoor_library/
  runs/
    2026-03-15T10-30-00/
      output/
        point_cloud.ply     # archival — always keep
        scene.spz
        alignment.json
      logs/
        step_1_frame_extraction.log
        step_7_training.log
        ...
      validation_report.json
      training_metrics.log
  current -> runs/2026-03-15T10-30-00/   # symlink to latest run
  frames/                                 # shared across runs
  db.db                                   # COLMAP database
```

The `current` symlink always points to the latest successful run. Previous runs are preserved. The user can compare outputs between runs in the UI (useful for A/B testing camera models or iteration counts).

---

## 6. UI/UX Design

### 6.1 Application Structure

The application is a single-page app with a persistent left sidebar for navigation and a main content area. There are five primary screens. The user progresses through them linearly for a new scene, but can jump to any screen for an existing scene.

```
┌─────────────────────────────────────────────────────────┐
│  VR Scout Studio                                [VR]    │
├──────────┬──────────────────────────────────────────────│
│          │                                              │
│  Scenes  │        Main Content Area                     │
│  ──────  │                                              │
│  + New   │   (one of five screens, see below)           │
│          │                                              │
│  indoor  │                                              │
│  library │                                              │
│  ├ runs  │                                              │
│  rooftop │                                              │
│  ├ runs  │                                              │
│          │                                              │
│──────────│                                              │
│ Settings │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

**Sidebar contents:**
- App title / logo
- Scene list (each scene expandable to show runs)
- "+ New Scene" button (opens upload flow)
- Settings (global pipeline defaults, Spark version toggle, theme)
- [VR] button in top-right — enters WebXR immersive mode for the currently loaded scene

### 6.2 Screen 1: Scene Dashboard (default landing)

Shows all scenes with their latest pipeline status. This is what the user sees on launch.

```
┌──────────────────────────────────────────────────┐
│  Scenes                                          │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ Indoor Library                               │ │
│  │ Last run: 2026-03-15 — ✅ Complete           │ │
│  │ 720K Gaussians · 14MB · SH1 · 72 FPS Quest  │ │
│  │ [View] [Re-process] [Export]                 │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ Outdoor Rooftop                              │ │
│  │ Last run: 2026-03-12 — ⚠️ Alignment needed  │ │
│  │ 620K Gaussians · 11MB · SH1                  │ │
│  │ [View] [Re-process] [Fix Alignment]          │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ + New Scene                                  │ │
│  │ Upload video to begin processing             │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 6.3 Screen 2: Upload & Pipeline Configuration

Triggered by "+ New Scene" or "Re-process." Two panels: upload on the left, configuration on the right.

**Left panel — Upload:**
- Drag-and-drop zone for video file (or click to browse)
- Chunked upload with progress bar (chunk size: 5MB)
- File name, size, duration displayed after selection
- Upload can be cancelled mid-transfer

**Right panel — Pipeline Configuration:**

| Setting | Default | Options | Notes |
|---------|---------|---------|-------|
| Scene name | Auto from filename | Editable text | Used as directory name |
| Camera model | SIMPLE_RADIAL | SIMPLE_RADIAL / OPENCV | Toggle when A/B test is complete |
| Matcher | exhaustive | exhaustive / sequential | Toggle when A/B test is complete |
| Training iterations | 30,000 | Numeric input (min 7000) | Warn below 20K |
| SH degree | 1 | 0 / 1 / 2 / 3 | Default 1 for architecture |
| Data factor | 1 | 1 / 2 / 4 | Downscale training images (2 = half res) |
| Frame extraction FPS | 2 | 1 / 2 / 3 | Higher = more frames = longer COLMAP |
| Scene change threshold | 0.1 | 0.05 - 0.3 slider | Lower = more frames kept |

**Bottom:** Large "Start Processing" button. Disabled until upload is complete.

### 6.4 Screen 3: Pipeline Monitor

This is the screen the user sees while the pipeline is running. It is the most complex screen and the one most critical for debugging.

```
┌──────────────────────────────────────────────────────────────┐
│  Processing: Indoor Library                                  │
│  Run: 2026-03-15T10:30:00                                    │
│                                                              │
│  Pipeline Progress                                           │
│  ═══════════════════════════════░░░░░░░░░░░  Step 7/9        │
│                                                              │
│  ✅ 0. Pre-flight          0:02    ─────────────────         │
│  ✅ 1. Frame extraction    0:45    305 frames                │
│  ✅ 2. Feature extraction  3:12    ─────────────────         │
│  ✅ 3. Matching            8:47    exhaustive                │
│  ✅ 4. Mapping             12:33   1 model, 298/305 reg     │
│  ✅ 5. Gravity alignment   0:08    transform applied         │
│  ✅ 6. Validation          0:03    97.7% reg, 0.42px err    │
│  🔄 7. Training            23:15   iter 14,200/30,000       │
│  ⬚  8. Conversion          ─       ─────────────────        │
│  ⬚  9. QA Review           ─       ─────────────────        │
│                                                              │
│  ┌── Training Live Metrics ───────────────────────────────┐  │
│  │                                                        │  │
│  │   PSNR ▲                    Loss ▼                     │  │
│  │   28.3 ┤   ╱──────         0.02 ┤──╲                   │  │
│  │   26.0 ┤  ╱                0.04 ┤   ╲──────            │  │
│  │   24.0 ┤ ╱                 0.06 ┤                      │  │
│  │   22.0 ┤╱                  0.08 ┤                      │  │
│  │        └──────────────          └──────────────        │  │
│  │        0    7K   14K            0    7K   14K          │  │
│  │                                                        │  │
│  │   Gaussians: 847,231   GPU Mem: 6.2/8.0 GB  ETA: 41m  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [View Log for Step 7]   [Cancel Pipeline]                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key UI behaviors:**

**Step list (left column):**
- Each step shows: status icon, name, elapsed time, and a one-line summary
- Clicking a completed step expands to show its summary and a "View Log" button
- The currently running step pulses gently to indicate activity
- Failed steps show in red with the error message inline and a "View Log" button

**Training live metrics panel (center):**
- Only visible during Step 7
- Two small line charts: PSNR (ascending = good) and Loss (descending = good)
- Charts update every 100 iterations via WebSocket
- Below charts: Gaussian count, GPU memory usage bar, and ETA
- If GPU memory > 90%: bar turns yellow with "High GPU memory" label
- If training stalls (no update for 5 minutes): yellow warning banner above charts

**Validation checkpoint (after Step 6):**
When the pipeline reaches `awaiting_confirmation`, the step list pauses and a confirmation panel replaces the training metrics area:

```
┌── Validation Report ──────────────────────────────────────┐
│                                                           │
│  Registration: 298/305 images (97.7%) ✅                  │
│  Reprojection error: 0.42 px (mean) ✅                    │
│  Camera model: SIMPLE_RADIAL                              │
│  Sparse points: 48,201                                    │
│  Alignment: Non-identity transform applied ✅              │
│                                                           │
│  ⚠️ 7 images failed to register. These regions may have  │
│  holes in the final scene.                                │
│                                                           │
│  [View Camera Path]  [Proceed to Training]  [Re-run SfM]  │
└───────────────────────────────────────────────────────────┘
```

"View Camera Path" opens the Camera Path Visualizer (see Screen 4 sub-view).

**Error states:**
When a step fails, the pipeline stops and the failed step expands to show:

```
┌── Step 7: Training — FAILED ──────────────────────────────┐
│                                                           │
│  ❌ CUDA out of memory at iteration 12,347                │
│                                                           │
│  Suggestion: Your scene is too large for full-resolution  │
│  training on an 8GB GPU. Re-run with Data Factor = 2      │
│  (half resolution) in pipeline settings.                  │
│                                                           │
│  [View Full Log]  [Re-run with Data Factor 2]  [Cancel]   │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

The "Re-run with Data Factor 2" button pre-fills the configuration and restarts from Step 7 only (Steps 1-6 outputs are reused).

### 6.5 Screen 4: QA Review

After the pipeline completes, or when the user clicks "View" on an existing scene. This is a split-screen view: 3D viewer on the left (70% width), controls panel on the right (30%).

```
┌─────────────────────────────────────┬────────────────────┐
│                                     │  QA Controls       │
│                                     │                    │
│                                     │  Scene Info        │
│        3D Viewer                    │  ──────────────    │
│   (Spark renderer, orbit controls)  │  Gaussians: 720K   │
│                                     │  File size: 14MB   │
│                                     │  SH degree: 1      │
│                                     │  FPS: 84           │
│                                     │                    │
│                                     │  Alignment         │
│                                     │  ──────────────    │
│                                     │  [Show Floor Grid] │
│                                     │  Y offset: [____]  │
│                                     │  Rotation: [____]  │
│                                     │  [Reset] [Apply]   │
│                                     │                    │
│                                     │  Overlays          │
│                                     │  ──────────────    │
│                                     │  [x] Camera path   │
│                                     │  [ ] Bounding box  │
│                                     │  [ ] Sparse points │
│                                     │                    │
│                                     │  Actions           │
│                                     │  ──────────────    │
│                                     │  [Enter VR]        │
│                                     │  [Export SPZ]       │
│                                     │  [Open in          │
│                                     │   SuperSplat]      │
│                                     │  [Re-process]      │
│                                     │                    │
└─────────────────────────────────────┴────────────────────┘
```

**3D Viewer (left panel):**
- Loads `scene.spz` via Spark renderer
- Default: orbit controls (click-drag to rotate, scroll to zoom, right-click to pan)
- Camera path overlay: thin colored line showing the DJI's path through the scene, with small frustum markers at every 10th camera position. Helps identify areas with sparse coverage (gaps in the line = potential holes).
- Floor grid overlay: semi-transparent grid plane at the current alignment Y=0. If alignment is correct, this grid sits on the actual floor of the scene. If it's floating above or below the floor, the user adjusts via the Alignment controls.
- FPS counter in bottom-left corner (always visible)

**Alignment controls (right panel):**
- "Show Floor Grid" toggle: renders a 10m × 10m grid at Y=0 in the scene
- Y offset: numeric input (meters) — shifts the floor plane up/down. Default 0.
- Rotation: numeric input (degrees around Y axis) — rotates the scene. Default 0. For cases where Manhattan alignment picked the wrong "forward" direction.
- "Reset" returns to the identity transform. "Apply" writes the new transform to `alignment.json` and reloads the viewer.
- For advanced users: a "Manual Transform" expandable section with a 4×4 matrix editor.

**Camera path overlay:**
The camera positions are extracted from the COLMAP sparse reconstruction (`images.bin`). Each camera is rendered as a small wireframe frustum colored by registration quality (green = low reprojection error, yellow = moderate, red = high). This tells the user: "The red cameras are where COLMAP struggled, so expect artifacts in those areas."

### 6.6 Screen 5: Settings

Global defaults that apply to new pipeline runs.

| Setting | Default | Notes |
|---------|---------|-------|
| Spark version | 0.1.10 | Toggle to 2.0-preview after evaluation |
| Default training iterations | 30,000 | |
| Default SH degree | 1 | |
| Default camera model | SIMPLE_RADIAL | Update after A/B test |
| Default matcher | exhaustive | Update after A/B test |
| Max SPZ size warning | 50MB | Quest 3 budget |
| Max Gaussian count warning | 800,000 | Quest 3 budget |
| WebSocket reconnect interval | 5s | For pipeline monitor |
| Theme | System default | Light / Dark / System |

### 6.7 Upload UX Details

Video files for architectural walkthroughs are typically 1-3GB (4K, 3-10 minutes). The upload must handle this gracefully.

**Chunked upload protocol:**
- Chunk size: 5MB
- Each chunk is a separate HTTP POST to `/api/upload/chunk`
- Server reassembles chunks into the final file
- Progress bar shows: percentage, uploaded/total MB, upload speed, ETA
- If the connection drops mid-upload, the client retries the current chunk (3 attempts, then pause with "Connection lost — Retry?" prompt)
- Upload can be cancelled at any time; server deletes partial file

**Upload validation (client-side, before transfer begins):**
- File type check: `.mp4`, `.mov`, `.avi` only
- File size check: warn if > 5GB ("Large file — upload may take a while"), block if > 20GB
- Duration check (via browser MediaSource API if available): warn if < 30 seconds ("Very short video — may not have enough frames")

**Upload validation (server-side, after reassembly):**
- Verify file is a valid video container (ffprobe check)
- Extract duration and resolution
- If not 4K: warn "Video is not 4K. Quality may be reduced."
- If duration < 30s: warn as above

### 6.8 Mobile & Tablet Considerations

The Studio (Product 1) is desktop-only. The Viewer (Product 2) must work on mobile.

**Viewer on mobile browsers:**
- Touch controls: one-finger drag to orbit, pinch to zoom, two-finger drag to pan
- Reduced Gaussian budget: cap at 300K on mobile (detect via `navigator.maxTouchPoints > 0` or screen size)
- Loading indicator: progress bar overlay while SPZ downloads (uses `onProgress` callback)
- No VR button on mobile (WebXR immersive-vr is not available on phone browsers)
- Test targets: Chrome Android, Safari iOS, Firefox Android, Samsung Internet

---

## 7. Renderer Architecture

### Spark (WebGL2) — Single Renderer, Evaluate 2.0

For the initial build, use Spark as the sole renderer. No two-tier WebGPU/WebGL2 split until the product thesis is validated on Quest 3.

The custom WebGPU renderer (GPU radix sort, opacity culling, XRGPUBinding) is deferred to a future phase. It is an optimization, not a validation requirement. Spark + WebGL2 can deliver the product thesis.

**Evaluate Spark 2.0-preview vs 0.1.10:**

| Feature | Spark 0.1.10 | Spark 2.0-preview |
|---------|-------------|-------------------|
| LOD streaming | Not built in (custom zone manager needed) | Voxel octree LOD built in |
| Sorting | Float16 or Float32 option | Float32 only, radial sort option |
| XR integration | VRButton utility | SparkXr (dedicated XR component) |
| Multi-renderer | Single renderer, multiple viewpoints | Multiple independent SparkRenderers |
| Splat encoding | Float16 centers | 32-bit precision centers |
| SOG support | SOGS via zip | SOG + SOGS, but remote URL loading limited |

If Spark 2.0's LOD system works reliably on Quest 3, it eliminates the need for a custom zone manager. This is a significant reduction in custom code.

**Spark 2.0 evaluation criteria (concrete — see Section 13 for protocol):**
1. Can `SparkXr` enter an immersive-vr session on Quest Browser? (Binary: yes/no)
2. Does LOD octree reduce peak GPU memory below 50MB for a 1M Gaussian scene? (Measure with Chrome DevTools)
3. Is FPS on Quest 3 standalone >= 72 FPS at 500K Gaussians? (Measure with `requestAnimationFrame` timer)
4. Can SPZ files be loaded directly, or does 2.0 require SOG/SOGS for LOD features? (Check API docs + test)
5. Is the npm package stable enough for production? (Check: release cadence, open issues, breaking changes in last 3 releases)

If any of criteria 1-4 fail, stay on Spark 0.1.10 and build the custom zone manager if needed.

### Scene Orientation Layer

Primary alignment happens pre-training via `colmap model_orientation_aligner`. The viewer applies any residual transform from `alignment.json`:

```typescript
// SceneRenderer.tsx
const alignment = await fetch(config.alignmentUrl).then(r => r.json());
splatMesh.matrix.fromArray(alignment.transform);
splatMesh.matrixAutoUpdate = false;
```

### Per-Eye Sorting for VR

Center-eye sorting produces depth popping artifacts in stereo VR. Spark supports multiple viewpoints:

```javascript
const leftViewpoint = spark.newViewpoint({ camera: leftEyeCamera });
const rightViewpoint = spark.newViewpoint({ camera: rightEyeCamera });
```

In Spark 2.0, this becomes multiple SparkRenderers with independent sort workers.

### Memory Manager (if Spark 2.0 LOD is insufficient)

Quest 3 crashes above ~50MB loaded simultaneously. If Spark 2.0's built-in LOD does not solve this, build a custom zone manager:

- Divide large architectural scenes into spatial zones at export time
- Load/unload SPZ assets based on user's XR position
- Preload adjacent zones, unload zones beyond N meters
- Never hold more than 2 zones in GPU memory simultaneously on Quest
- Zone boundaries should align with room boundaries (doorways are natural transition points)

This is Phase 6 work and may not be needed. Evaluate Spark 2.0 first.

---

## 8. VR Delivery Strategy

### Three Delivery Modes

**Mode 1: Desktop Browser (primary, full fidelity)**
- Chrome/Firefox/Safari/Edge on desktop
- Spark renderer (WebGL2), up to 1M splats
- Orbit/fly controls for non-VR browsing

**Mode 2: Virtual Desktop → Quest 3 (full fidelity wireless VR)**
- Desktop Chrome running the viewer (RTX 4070 doing the work)
- Quest 3 connected via Virtual Desktop app
- Confirmed working: WebXR through Virtual Desktop functions

**Mode 3: Quest 3 Standalone (portable, reduced fidelity)**
- Quest Browser (WebGL2 only, no WebGPU+WebXR)
- Spark renderer, 500K-800K Gaussians max, CPU sort
- Under 50MB SPZ delivery
- `maxStdDev: Math.sqrt(5)`, `antialias: false` in VR mode

> **Constraint:** Meta Quest Browser does not support WebGPU+WebXR as of March 2026. No flag or workaround exists.

### Future Hardware

- **Samsung Galaxy XR** (Oct 2025): Full native WebXR + WebGPU. Currently the only standalone WebGPU+WebXR device.
- **Apple Vision Pro**: WebXR via Safari on visionOS 26. WebGPU+WebXR as of Safari 26.2.

---

## 9. Performance Budgets & Constraints

### Desktop (Spark/WebGL2)

| Metric | Target |
|--------|--------|
| Gaussians | Up to 1M |
| File size (SPZ) | 12-50MB |
| Frame time | < 16ms (60 FPS) |
| SH degree | 1 (configurable per scene) |

### Quest 3 Standalone (Spark/WebGL2)

| Metric | Target |
|--------|--------|
| Gaussians | **500K-800K max** |
| File size (SPZ) | **Under 50MB** |
| Frame time | < 14ms (72 FPS) |
| Sort | CPU bucket sort in web worker |
| SH degree | 1 |
| Memory | Never exceed ~1.5GB total JS heap |
| maxStdDev | Math.sqrt(5) |

### Mobile Browser (Viewer only)

| Metric | Target |
|--------|--------|
| Gaussians | **300K max** |
| File size (SPZ) | **Under 20MB** |
| Frame time | < 33ms (30 FPS acceptable) |
| SH degree | 0 or 1 |
| Memory | Under 1GB JS heap |

### Training Targets

| Metric | Value |
|--------|-------|
| Source frames (per room) | 200-500 |
| Overlap | 70-80% between consecutive positions |
| Training iterations | 30,000 (MCMC) |
| SH degree at training | 1 (default), 2-3 for specular scenes |
| Expected Gaussians (raw) | 800K-1.5M |
| Expected Gaussians (post-cull) | 500K-800K |

---

## 10. Custom Code You Own

These are the pieces that make the system yours.

### process.sh
Pipeline orchestration with structured status reporting, per-step log capture, validation gates, error pattern detection, and hang timeouts. See Section 4 for full implementation.

### validate_colmap.py
Pre-training validation. Outputs a JSON report with:
- Registration rate (images registered / total images)
- Mean reprojection error (pixels)
- Point cloud density (points per registered image)
- Camera model used
- Scene scale estimate
- Alignment transform delta (identity check)
- List of unregistered images (for camera path visualization — these are the gaps)

Exit codes: 0 = all checks pass, 1 = warnings (user should review), 2 = blocked (registration < 50%).

### align_scene.py (refinement tool, not primary alignment)
Residual floor-plane adjustment for cases where `model_orientation_aligner` needs correction. Used via the QA Review screen's alignment controls. Takes current alignment.json + user adjustments (Y offset, Y rotation) and writes updated alignment.json.

### SceneRenderer.tsx (the extractable viewer core)
- Scene registry lookup (scene ID → SPZ URL + alignment.json)
- Load alignment.json, apply as SplatMesh transform
- Per-eye SparkViewpoint for VR
- Quest 3 optimizations (maxStdDev, antialias)
- SPZ download progress via `onProgress` callback
- Loading state management (loading indicator while SPZ downloads and parses)
- Error boundary (catches Spark renderer crashes, shows fallback message)
- Clean props interface for standalone extraction

### Pipeline UI Components (React)
- **UploadPanel**: Chunked upload with progress, client-side validation, cancel
- **PipelineMonitor**: Step list with status icons, expandable log viewer, training metrics charts
- **ValidationReport**: Displays validate_colmap.py output, camera path visualization link, proceed/re-run buttons
- **CameraPathViewer**: 3D view of COLMAP camera positions as colored frustums overlaid on sparse point cloud
- **FloorPlaneAdjuster**: Grid overlay with Y offset and rotation controls
- **ScenePreview**: Wraps SceneRenderer.tsx with QA-specific overlays (camera path, floor grid, bounding box)
- **StatusDashboard**: Scene list with pipeline status summary per scene

### FastAPI Endpoints
- `POST /api/upload/chunk` — chunked file upload
- `POST /api/pipeline/start/{scene_id}` — start pipeline with configuration
- `POST /api/pipeline/resume/{scene_id}/{step}` — resume from a specific step
- `POST /api/pipeline/cancel/{scene_id}` — kill running pipeline
- `GET /api/pipeline/status/{scene_id}` — current status.json
- `GET /api/pipeline/logs/{scene_id}/{step}` — log file content (paginated)
- `GET /api/pipeline/validation/{scene_id}` — validation report JSON
- `GET /api/pipeline/metrics/{scene_id}` — training metrics (for chart)
- `PUT /api/scene/{scene_id}/alignment` — update alignment.json
- `GET /api/scene/{scene_id}/cameras` — COLMAP camera positions (for path visualization)
- `GET /api/scene/{scene_id}/config` — scene config for viewer
- `WS /api/ws/{scene_id}` — WebSocket for live pipeline status + training metrics

### REMOVED: cull_floaters.py
Replaced by 3dgsconverter built-in `--sor_intensity` and `--min_opacity`.

### DEFERRED: Custom WebGPU Renderer
Deferred until product thesis is validated. Spark + WebGL2 delivers the initial product.

### EVALUATE FIRST: Custom Zone Manager
Spark 2.0-preview includes voxel octree LOD. If it works on Quest 3, this is configuration not custom code.

---

## 11. Build Order

Do these in sequence. Do not skip ahead.

### Phase 0 — Pre-Build Housekeeping (1 day)
1. Resolve `indoor_library` / `library_area` scene ambiguity (SSH into WSL, compare directories, consolidate)
2. Verify COLMAP version and available subcommands (`colmap help`, check for global mapper)
3. Verify gsplat is cloned and `examples/simple_trainer.py` exists at the expected path
4. Pin gsplat version in conda environment (`pip freeze > requirements.txt`)
5. Run `nvidia-smi` and confirm GPU is accessible from WSL
6. Document findings in a `SETUP.md` at the project root

### Phase 1 — Validate the Thesis (3-5 days)
**Goal:** Confirm the product works on Quest 3 before building anything else.
1. Load existing `outdoor_rooftop` and `indoor_library` SPZ files in Spark 0.1.10 viewer
2. Deploy to a local HTTPS server (Quest Browser requires HTTPS for WebXR)
3. Test on Quest 3 standalone browser
4. Measure: FPS (target 72), load time, visual quality, orientation issues
5. Document: what works, what doesn't, specific visual artifacts
6. Simultaneously: install Spark 2.0-preview in a separate branch, load same scenes, run Spark 2.0 evaluation criteria (Section 7)
7. **Decision gate:** If Quest 3 cannot render existing scenes at 72 FPS, the product thesis needs adjustment before proceeding. If it can, proceed.

### Phase 2 — A/B Test Pipeline Settings (3-5 days)
**Goal:** Lock in COLMAP settings based on empirical data, not theory.
1. Run A/B tests per the protocol in Section 13
2. Test OPENCV vs SIMPLE_RADIAL on indoor_library footage
3. Test sequential vs exhaustive matching on same footage
4. Compare: registration rate, reprojection error (primary metrics)
5. Train both variants at 30K MCMC, compare: PSNR, SSIM, visual inspection
6. Lock in settings. Update `process.sh` defaults and Settings screen defaults.
7. Train indoor_library at 30K MCMC. Compare against existing 56K ADC checkpoint.
8. **Decision gate:** Settings are locked. No more "A/B test required" placeholders in the plan.

### Phase 3 — Rebuild the Pipeline (5-7 days)
**Goal:** A working, observable pipeline that produces deployable SPZ files.
1. Write `process.sh` with all validation gates, status reporting, log capture (Section 4)
2. Write `validate_colmap.py` with JSON report output
3. Set up directory structure: `scenes/{id}/frames/`, `logs/`, `sparse/`, `aligned/`, `output/`, `runs/`
4. Add `colmap model_orientation_aligner` step
5. Replace spz Python library with 3dgsconverter
6. Set up gsplat data directory symlinks (images/ → frames/, sparse/0/ → aligned/)
7. Re-process indoor_library with the corrected pipeline end-to-end
8. Validate output: load SPZ in viewer, check alignment, check Gaussian count
9. Test on Quest 3
10. **Decision gate:** Pipeline produces a viewable, correctly-oriented scene from video input in one script invocation.

### Phase 4 — Pipeline UI (7-10 days)
**Goal:** The Studio application — upload, monitor, review, all in one interface.
1. FastAPI: implement all API endpoints (Section 10)
2. Replace `jobs.json` with SQLite immediately (not deferred)
3. WebSocket: pipeline status + training metrics stream
4. React: Scene Dashboard (Screen 1)
5. React: Upload panel with chunked upload (Screen 2)
6. React: Pipeline Monitor with step list, training charts, error states (Screen 3)
7. React: Validation checkpoint UI with proceed/re-run flow
8. React: QA Review with camera path visualization, floor plane controls (Screen 4)
9. React: Settings screen (Screen 5)
10. End-to-end test: upload video → monitor pipeline → review scene → enter VR
11. **Decision gate:** A non-technical user can process a scene from video to VR without touching the command line.

### Phase 5 — Viewer Polish (5-7 days)
**Goal:** The extractable viewer component is production-ready.
1. Clean SceneRenderer.tsx interface boundary (ViewerProps contract)
2. Add `onProgress` callback for SPZ download progress
3. Add loading indicator (progress bar overlay during download + parse)
4. Add error boundary (catches renderer crashes, shows fallback)
5. Per-eye SparkViewpoint for VR (eliminate depth popping)
6. Quest 3 optimizations (maxStdDev, antialias, Gaussian count cap)
7. Test on Quest 3 standalone at 500K-800K Gaussians
8. Test on mobile browsers: Chrome Android, Safari iOS, Firefox Android
9. Confirm 72 FPS on Quest 3, 30+ FPS on mobile
10. **Decision gate:** Viewer component can be used standalone with just a scene config URL.

### Phase 6 — LOD / Streaming (if needed)
1. Test Spark 2.0 LOD octree on Quest 3 first
2. If sufficient: configure, no custom code
3. If insufficient: build custom zone manager
4. Test load/unload on Quest 3

### Phase 7 — Viewer Extraction
1. Extract viewer from monolith into standalone package
2. Publish as standalone npm package or JS bundle
3. Write integration docs (embed in any website with 5 lines of code)
4. Test embedding in sample website

### Phase 8 — Security + Production
1. Fix command injection (`create_subprocess_shell` → `create_subprocess_exec`)
2. Fix path traversal on upload (sanitize filenames, restrict to upload directory)
3. Fix XSS via inline HTML interpolation (use template engine with auto-escaping)
4. SQLite queue is already in place from Phase 4 (no migration needed)
5. Add upload size limits (server-side: 20GB max, configurable)
6. Add rate limiting on API endpoints
7. HTTPS configuration for production deployment

### Future Phase — Custom WebGPU Renderer
Only after Phases 1-8 are complete and validated.
1. Set up Three.js WebGPU backend in a parallel branch
2. Write WGSL GPU radix sort (reference: WebSplatter arXiv:2602.03207)
3. Write opacity-aware geometry culling pass
4. Validate render quality matches Spark output
5. Add capability detection and runtime switching in SceneRenderer.tsx
6. XRGPUBinding for desktop VR (Chrome 135+ flags)
7. Test via Virtual Desktop + Quest 3

---

## 12. Known Failure Modes & User-Facing Error Map

This section maps every known failure mode to a specific user-facing error message with an actionable suggestion. The Pipeline Monitor UI uses this table to translate raw errors into helpful guidance.

### Capture

| Problem | Detection | User-Facing Message | Suggested Action |
|---------|-----------|---------------------|------------------|
| Too few frames | Frame count < 50 after extraction | "Only {N} frames extracted from your video. At least 50 are needed, and 150+ is recommended for good results." | "Try recording a longer video (2+ minutes) with slow, steady movement." |
| Marginal frame count | Frame count 50-149 | "⚠️ {N} frames extracted. This may work, but 150+ frames typically produce better results." | "Consider re-shooting with slower movement, or reduce the scene-change threshold in settings." |
| Near-duplicate frames (no scene filter) | Many frames with identical features | (Prevented by scene-change filter in ffmpeg) | — |

### COLMAP / SfM

| Problem | Detection | User-Facing Message | Suggested Action |
|---------|-----------|---------------------|------------------|
| Zero registration | 0 images registered | "COLMAP could not match any frames. The video may have too little overlap between frames, or the scene may lack visual features." | "Re-shoot: move more slowly with 70-80% overlap between positions. Avoid blank walls and reflective surfaces." |
| Low registration (< 50%) | Registration rate < 50% | "Only {rate}% of frames were matched ({N}/{total}). This is too low for a usable scene." | "Re-shoot the problem areas. Common causes: fast movement, low-texture surfaces, glass/mirrors." |
| Moderate registration (50-89%) | Registration rate 50-89% | "⚠️ {rate}% of frames matched ({N}/{total}). The scene will have holes in unregistered areas." | "You can proceed, but consider re-shooting areas with sparse coverage. [View Camera Path] to see gaps." |
| Multiple COLMAP models | > 1 model in sparse/ | "⚠️ COLMAP split your scene into {N} separate reconstructions. Using the largest ({count} images). Your scene may have disconnected regions." | "This often means there's a gap in camera coverage. Walk continuously without skipping areas." |
| High reprojection error | Mean error > 1.0 pixel | "⚠️ Average reprojection error is {error}px (target: < 1.0px). Training quality may be reduced." | "This can indicate motion blur or lens distortion issues. Ensure 1/500s+ shutter speed." |
| COLMAP hang | No progress for > warn threshold | "⚠️ {step_name} has been running for {elapsed} — expected ~{expected}. It may be processing a difficult section." | "[Continue Waiting] or [Kill and Retry with Different Settings]" |

### Gravity Alignment

| Problem | Detection | User-Facing Message | Suggested Action |
|---------|-----------|---------------------|------------------|
| Silent alignment failure | Output transform = identity matrix | "⚠️ Automatic gravity alignment could not detect floor/wall directions. You'll need to manually align the scene in QA Review." | "[Continue to Training] — you can fix alignment after training using the floor plane tool." |

### Training

| Problem | Detection | User-Facing Message | Suggested Action |
|---------|-----------|---------------------|------------------|
| CUDA OOM | "CUDA out of memory" in log | "GPU ran out of memory at iteration {N}. Your scene is too large for full-resolution training." | "[Re-run at Half Resolution] (adds --data_factor 2, uses Steps 1-6 outputs)" |
| NaN loss / divergence | "nan" in loss output | "Training diverged at iteration {N}. The learning rate may be too high for this scene's scale." | "[Re-run with Lower Learning Rate] (0.1× default)" |
| Training stall | No log output for > 5 minutes | "⚠️ Training hasn't reported progress in {elapsed}. The GPU may be blocked or the process may have hung." | "[Continue Waiting] or [Kill and Retry]" |
| Loss spike | Loss increases > 50% in 500 iterations | "⚠️ Training quality dropped sharply at iteration {N}. This may recover, or may indicate instability." | "Monitor for 1000 more iterations. If it doesn't recover: [Stop and Re-run with Lower LR]" |
| Low final PSNR | PSNR < 20 dB at convergence | "Training completed but quality is lower than expected (PSNR: {value} dB, target: > 25 dB)." | "Consider: more training iterations, better source footage, or higher SH degree for specular scenes." |
| PSNR plateau | No PSNR improvement for > 5000 iterations | "Quality has plateaued — additional iterations are unlikely to improve the result." | "[Stop Training Early] to save time." |

### Conversion

| Problem | Detection | User-Facing Message | Suggested Action |
|---------|-----------|---------------------|------------------|
| SPZ file missing | File doesn't exist after conversion | "Conversion failed — no output file was created." | "[View Log] to diagnose. Common cause: 3dgsconverter crash on malformed PLY." |
| SPZ too small | File < 1KB | "Output file is suspiciously small ({size} bytes). Conversion likely failed." | "[View Log] and [Re-run Conversion]" |
| SPZ too large | File > 50MB | "⚠️ Scene is {size}MB — exceeds Quest 3's 50MB budget. It will work on desktop but may crash Quest 3." | "Increase culling aggressiveness: raise --sor_intensity or --min_opacity in settings, then [Re-run Conversion]" |
| Too many Gaussians | Count > 800K after culling | "⚠️ Scene has {count} Gaussians after cleanup — above the Quest 3 target of 800K." | "Open in [SuperSplat] for manual cleanup, or increase --sor_intensity and [Re-run Conversion]" |
| SH data stripped | SH degree 0 when > 0 expected | "SH color data was lost during conversion. The scene will look flat." | "Check 3dgsconverter flags. [View Log]" |

### WebXR / Quest 3

| Problem | Detection | User-Facing Message | Suggested Action |
|---------|-----------|---------------------|------------------|
| Depth popping | (Visual, not auto-detected) | — | Ensure per-eye SparkViewpoints are active. Check Viewer settings. |
| Oversized edge Gaussians | (Visual, not auto-detected) | — | Verify `maxStdDev: Math.sqrt(5)` is set in scene config. |
| Quest OOM during viewing | Quest Browser tab crashes | "Quest Browser crashed — the scene may be too large for standalone viewing." | "Try: reduce Gaussians to < 500K, ensure SPZ < 30MB, or use Virtual Desktop mode instead." |

---

## 13. A/B Test Protocol

### Test Infrastructure

Before running any A/B tests, set up the comparison framework:

1. **Fixed evaluation viewpoints:** Pick 5 camera positions in the indoor_library scene that cover: a wide shot, a detail shot (e.g., book spines), a hallway/corridor, a window area, and an oblique angle. Screenshot each variant from these exact positions. Store viewpoint transforms in a `test_viewpoints.json` file.

2. **Metrics capture script:** Write a small script (`scripts/compare_runs.py`) that reads two gsplat training output directories and reports: final PSNR, final SSIM, final LPIPS, Gaussian count, training time, peak GPU memory. Output as a comparison table.

3. **Quest 3 FPS measurement:** Create a simple FPS logger in the viewer that records frame times for 60 seconds after scene load, then reports: mean FPS, P5 FPS (5th percentile — worst frames), P95 FPS. This is more useful than a single "FPS" number.

### Test 1: Camera Model (OPENCV vs SIMPLE_RADIAL)

**Hypothesis:** OPENCV models tangential distortion and should produce better COLMAP registration for DJI footage. However, existing data shows SIMPLE_RADIAL achieved 261/305 registration — OPENCV may not improve on this.

**Protocol:**
1. Use indoor_library source footage (same video file)
2. Run COLMAP with SIMPLE_RADIAL + exhaustive matcher → record registration rate, reprojection error
3. Run COLMAP with OPENCV + exhaustive matcher → record registration rate, reprojection error
4. Whichever has higher registration rate AND lower reprojection error wins
5. If they're within 2% registration rate of each other, prefer SIMPLE_RADIAL (fewer parameters = more stable)
6. Train both with gsplat MCMC 30K → compare PSNR, SSIM, visual inspection at 5 viewpoints
7. **Lock in winner.**

### Test 2: Matcher (Sequential vs Exhaustive)

**Hypothesis:** Sequential is faster and leverages temporal adjacency. Exhaustive was part of the 97.9% registration result.

**Protocol:**
1. Use same footage as Test 1
2. Use the winning camera model from Test 1
3. Run COLMAP with sequential matcher → record: registration rate, reprojection error, wall clock time
4. Run COLMAP with exhaustive matcher → record: same metrics
5. If sequential registration is within 3% of exhaustive: prefer sequential (faster)
6. If sequential drops > 3%: keep exhaustive
7. **Lock in winner.**

### Test 3: 30K MCMC vs 56K ADC (Iteration Quality)

**Hypothesis:** 30K MCMC matches or exceeds the existing 56K Nerfstudio/ADC checkpoint.

**Protocol:**
1. Use the winning COLMAP settings from Tests 1-2
2. Train with gsplat MCMC at 30K → record: PSNR, SSIM, LPIPS, Gaussian count, training time
3. Compare against existing 56K ADC checkpoint (from prior Nerfstudio run)
4. Visual inspection at 5 viewpoints
5. Load both in Spark viewer, screenshot side-by-side
6. Test both on Quest 3: FPS comparison
7. If MCMC 30K >= ADC 56K on PSNR and visual quality: 30K is confirmed sufficient
8. If MCMC 30K is noticeably worse: try 40K and 50K MCMC to find the knee
9. **Lock in iteration count.**

### Test 4: Spark 2.0-preview Viability

**Hypothesis:** Spark 2.0's LOD octree and SparkXr work on Quest 3, eliminating custom zone manager code.

**Protocol:**
1. Load existing indoor_library SPZ in Spark 2.0-preview viewer
2. Deploy to HTTPS server
3. Open on Quest 3 standalone
4. Measure: FPS (60s logger), load time, visual quality compared to 0.1.10
5. Test SparkXr: does it enter immersive-vr session? (Binary: yes/no)
6. Test LOD: load a large scene (if available) — does peak memory decrease?
7. Check: does Spark 2.0 load SPZ directly, or does it require SOG for LOD features?
8. If all 5 evaluation criteria from Section 7 pass: migrate to 2.0
9. If any critical criterion fails: stay on 0.1.10, re-evaluate when 2.0 stabilizes
10. **Lock in Spark version.**

---

## 14. Future Roadmap

### Near-term
- Monitor Quest Browser for WebGPU+WebXR support
- Samsung Galaxy XR as standalone WebGPU+WebXR device
- Three.js WebGPU backend stability improvements
- DJI IMU/EXIF gravity extraction for automated alignment (bypasses model_orientation_aligner)

### Medium-term
- KHR_gaussian_splatting ratification (expected Q2 2026)
- Compression extension ratification (SPZ vs L-GSC — uncertain timeline)
- Custom WebGPU renderer (future phase — see Build Order)
- Multi-room scene support with zone streaming

### Formats to watch
- **L-GSC** (Qualcomm) — competing Khronos compression proposal
- **glTF-embedded Gaussians** — SPZ-inside-glTF after ratification

---

## 15. References

### Core Tools

| Tool | URL | License |
|------|-----|---------|
| gsplat | https://github.com/nerfstudio-project/gsplat | Apache 2.0 |
| COLMAP | https://github.com/colmap/colmap | BSD-3 |
| GLOMAP (archived) | https://github.com/colmap/glomap | BSD-3 |
| SuperSplat | https://github.com/playcanvas/supersplat | MIT |
| Spark renderer | https://github.com/sparkjsdev/spark | MIT |
| 3dgsconverter | https://github.com/francescofugazzi/3dgsconverter | MIT |
| GaussForge | https://github.com/3dgscloud/GaussForge | MIT |
| spz (Niantic) | https://github.com/nianticlabs/spz | MIT |

### Format Specifications

| Format | Reference |
|--------|-----------|
| SPZ | https://github.com/nianticlabs/spz |
| KHR_gaussian_splatting RC | https://www.khronos.org/news/press/gltf-gaussian-splatting-press-release |
| Formats comparison | https://www.polyvia3d.com/formats/gaussian-splatting-formats |

### WebGPU / WebXR Standards

| Resource | URL |
|----------|-----|
| WebGPU implementation status | https://github.com/gpuweb/gpuweb/wiki/Implementation-Status |
| WebXR-WebGPU Binding explainer | https://github.com/immersive-web/WebXR-WebGPU-Binding/blob/main/explainer.md |
| Chrome 135 WebGPU+WebXR | https://developer.chrome.com/blog/new-in-webgpu-135 |
| WebGPU+WebXR via Virtual Desktop | https://icepick.info/2025/10/24/webxr-webgpu-on-quest-via-virtual-desktop/ |

### Research Papers

| Paper | URL | Relevance |
|-------|-----|-----------|
| gsplat (JMLR 2025) | https://www.jmlr.org/papers/volume26/24-1476/24-1476.pdf | Trainer reference |
| WebSplatter (Feb 2026) | https://arxiv.org/html/2602.03207v1 | Future WebGPU renderer reference |
| StableGS (Mar 2025) | https://arxiv.org/html/2503.18458 | Why floaters form |
| StopThePop | https://r4dl.github.io/StopThePop/ | Stereo sorting artifacts |

---

## 16. Appendices

### Appendix A: Environment Setup

```bash
# Conda environment
conda activate splat
export CUDA_HOME=/usr/local/cuda-11.8

# gsplat — clone the repo (need examples/simple_trainer.py)
git clone https://github.com/nerfstudio-project/gsplat.git tools/gsplat
pip install gsplat

# 3dgsconverter
pip install git+https://github.com/francescofugazzi/3dgsconverter.git

# Pin versions
pip freeze > requirements.txt
```

> **CUDA version note:** CUDA 11.8 works with current gsplat, but the ecosystem is moving to 12.x. Pin your gsplat version and test before upgrading CUDA. If gsplat features like PPIPS or 3DGUT integration require CUDA 12.x, document the upgrade path.

### Appendix B: Scene Registry

```typescript
interface SceneConfig {
  id: string;
  name: string;
  spzUrl: string;
  alignmentUrl: string;
  gaussianCount: number;
  shDegree: 0 | 1 | 2 | 3;
  coordinateSystem: 'rub';    // SPZ is always RUB — no ambiguity
  maxStdDev?: number;         // default: Math.sqrt(5) for Quest 3
  lodEnabled?: boolean;       // for Spark 2.0 LOD octree
  mobileBudget?: number;      // max Gaussians on mobile (default: 300K)
}
```

> Coordinate system fix: Prior plans used 'opengl' and 'rub' as separate values. OpenGL convention IS RUB. Registry now uses 'rub' consistently.

### Appendix C: Status File Examples

**Running state:**
```json
{
  "scene_id": "indoor_library",
  "current_step": 7,
  "step_name": "training",
  "status": "running",
  "message": "Training iteration 14200/30000 — PSNR: 28.3 dB",
  "timestamp": "2026-03-15T10:53:00Z",
  "pid": 12345
}
```

**Failed state:**
```json
{
  "scene_id": "indoor_library",
  "current_step": 7,
  "step_name": "training",
  "status": "failed",
  "message": "CUDA out of memory. Try: re-run with --data_factor 2 to halve resolution.",
  "timestamp": "2026-03-15T11:02:00Z",
  "pid": 12345
}
```

**Awaiting confirmation:**
```json
{
  "scene_id": "indoor_library",
  "current_step": 6,
  "step_name": "validation",
  "status": "awaiting_confirmation",
  "message": "Validation complete. 298/305 images registered (97.7%). Review report and confirm.",
  "timestamp": "2026-03-15T10:45:00Z",
  "pid": 12345
}
```

### Appendix D: WebSocket Message Schema

Messages from server to client over `WS /api/ws/{scene_id}`:

```typescript
type WSMessage =
  | { type: 'status'; data: StatusFile }           // Pipeline step status update
  | { type: 'metric'; data: TrainingMetric }        // Training iteration metric
  | { type: 'log_line'; data: { step: number; line: string } }  // Live log line
  | { type: 'warning'; data: { message: string } }  // Hang detection, anomaly alert
  | { type: 'gpu'; data: { memory_used_mb: number; memory_total_mb: number; utilization_pct: number } }

interface TrainingMetric {
  iteration: number;
  max_iterations: number;
  loss: number;
  psnr: number;
  gaussian_count: number;
  elapsed_seconds: number;
  eta_seconds: number;
}
```

### Appendix E: Directory Structure

```
vr-scout-v2/
├── raw/                          # Source video files
│   └── indoor_library.mp4
├── scenes/
│   └── indoor_library/
│       ├── frames/               # Extracted JPEG frames (shared across runs)
│       ├── db.db                 # COLMAP database
│       ├── sparse/               # COLMAP mapper output
│       │   └── 0/
│       ├── aligned/              # Post-alignment sparse reconstruction
│       ├── gsplat_input/         # Symlinks for gsplat directory structure
│       │   ├── images -> ../frames
│       │   └── sparse/0/ -> ../../aligned/
│       ├── runs/
│       │   └── 2026-03-15T10-30-00/
│       │       ├── output/
│       │       │   ├── point_cloud.ply
│       │       │   ├── scene.spz
│       │       │   └── alignment.json
│       │       ├── logs/
│       │       │   ├── step_1_frame_extraction.log
│       │       │   ├── step_2_feature_extraction.log
│       │       │   └── ...
│       │       ├── validation_report.json
│       │       └── training_metrics.log
│       ├── current -> runs/2026-03-15T10-30-00/
│       ├── status.json           # Live pipeline status
│       └── test_viewpoints.json  # Fixed viewpoints for A/B comparisons
├── scripts/
│   ├── process.sh                # Pipeline orchestration
│   ├── validate_colmap.py        # Pre-training validation
│   ├── align_scene.py            # Residual alignment tool
│   └── compare_runs.py           # A/B test metrics comparison
├── tools/
│   └── gsplat/                   # Cloned gsplat repo
├── server/                       # FastAPI backend
│   ├── main.py
│   ├── routes/
│   ├── ws/
│   └── db.sqlite
├── client/                       # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── UploadPanel.tsx
│   │   │   ├── PipelineMonitor.tsx
│   │   │   ├── ValidationReport.tsx
│   │   │   ├── CameraPathViewer.tsx
│   │   │   ├── FloorPlaneAdjuster.tsx
│   │   │   ├── ScenePreview.tsx
│   │   │   └── StatusDashboard.tsx
│   │   ├── viewer/
│   │   │   └── SceneRenderer.tsx  # Extractable viewer core
│   │   └── App.tsx
│   └── vite.config.ts
├── requirements.txt              # Pinned Python dependencies
├── SETUP.md                      # Environment setup + Phase 0 findings
└── README.md
```

---

*Document last updated: March 15, 2026*
*Project: VR Scout v3 | Stack: React 19, R3F, Three.js, gsplat, COLMAP, Spark, SPZ*
*Architecture: Monolith-first with extractable viewer component*
*Key addition over v2: Full pipeline observability, UI/UX specification, validation gates, error mapping, A/B test protocol*
