# VR Scout v4 — Complete Design Plan
**Hardware-Adaptive Gaussian Splatting Pipeline with Generative AI Enhancement**
*March 31, 2026 — Full rebuild from v3 incorporating portability, depth priors, segmentation, perceptual pruning, universal metadata extraction, and multi-source input support*

---

## Table of Contents

1. [What Changed and Why](#1-what-changed-and-why)
2. [Project Goals & Product Architecture](#2-project-goals--product-architecture)
3. [History & Lessons Learned](#3-history--lessons-learned)
4. [Hardware-Adaptive Environment System](#4-hardware-adaptive-environment-system)
5. [The Complete Tech Stack](#5-the-complete-tech-stack)
6. [Input System & Universal Metadata Extraction](#6-input-system--universal-metadata-extraction)
7. [The Full Pipeline (16 Steps)](#7-the-full-pipeline-16-steps)
8. [Pipeline Observability & Error Handling](#8-pipeline-observability--error-handling)
9. [Scale, Leveling & Alignment Strategy](#9-scale-leveling--alignment-strategy)
10. [Generative AI Enhancement Layer](#10-generative-ai-enhancement-layer)
11. [UI/UX Design](#11-uiux-design)
12. [Renderer Architecture](#12-renderer-architecture)
13. [VR Delivery Strategy](#13-vr-delivery-strategy)
14. [Performance Budgets & Constraints](#14-performance-budgets--constraints)
15. [Custom Code You Own](#15-custom-code-you-own)
16. [Build Order](#16-build-order)
17. [Known Failure Modes & User-Facing Error Map](#17-known-failure-modes--user-facing-error-map)
18. [A/B Test Protocol](#18-ab-test-protocol)
19. [Future Roadmap](#19-future-roadmap)
20. [References](#20-references)
21. [Appendices](#21-appendices)

---

## 1. What Changed and Why

### Why v3 needed a rebuild

Three categories of failure drove the v4 redesign:

**Hardware portability.** The v3 pipeline broke on every new machine. Hardcoded `CUDA_HOME=/usr/local/cuda-11.8` failed on the RTX 5090 lab machine (requires CUDA 12.8+). Pre-compiled wheels for gsplat, fused-ssim, and 3dgsconverter crashed on Blackwell GPUs (SM 120). The pipeline was designed for one machine and could not be deployed anywhere else.

**Scale, leveling, and alignment.** Every splat v3 produced had problems with orientation and scale. COLMAP's `model_orientation_aligner` returned identity transforms (silent failure) on the library_area scene. The Manhattan world assumption doesn't work reliably on all architectural interiors. Other splat viewers don't have this problem because they use IMU/gravity metadata from the capture device — data that v3 never extracted.

**Missing generative enhancement.** v3 used only photometric loss during training. Modern pipelines use depth priors to produce better surfaces on textureless areas, segmentation to eliminate wasted Gaussians on sky/background, and perceptual pruning to hit tighter size budgets without visible quality loss. Marble by World Labs validated that the 3DGS + SPZ + Spark + Quest 3 stack is correct — but also demonstrated the gap between reconstruction-only and reconstruction-plus-AI approaches.

### What's new in v4

| Category | v3 | v4 |
|----------|----|----|
| Environment setup | Hardcoded paths, manual install | `setup_environment.sh` with GPU detection, dynamic CUDA_HOME, source builds |
| Metadata extraction | None | Universal extractor: DJI protobuf, CAMM, GPMF, Apple MOV, EXIF |
| Supplementary inputs | None | Optional SRT sidecar (drones), optional 360° photos (gap filling) |
| Depth priors | Not used | Depth Anything V2/V3 on all frames → depth supervision during training |
| Background segmentation | Not used | SAM 2 masks for sky/background removal (optional, outdoor scenes) |
| Perceptual pruning | Statistical SOR only | LPIPS-guided Gaussian removal for intelligent budget targeting |
| Mesh extraction | Not planned | SuGaR or equivalent → floor plane, collision, VR teleportation |
| SPZ export | Single tier | Two-tier: desktop full-fidelity + Quest-optimized |
| Camera-path video | Not planned | Automated flythrough MP4 from COLMAP path |
| Alignment | Manhattan world only | Gravity priors → Manhattan fallback → mesh floor detection → manual |
| Scene-change filter | 0.1 (too aggressive for DJI) | 0.02 default (or disabled for gimbal footage) |
| CUDA_HOME | Hardcoded 11.8 | Dynamic detection per machine |
| Pipeline steps | 10 | 16 (new steps are automated, no added user complexity) |

### What carries forward unchanged from v3

- Product architecture: VR Scout Studio + extractable VR Scout Viewer
- UI/UX: 5 screens (Dashboard, Upload, Pipeline Monitor, QA Review, Settings) with enhancements
- Pipeline observability: status.json, WebSocket, per-step logs, hang detection, validation gates
- SPZ format: confirmed, not revisited
- Renderer: Spark (WebGL2) with 2.0 evaluation
- VR delivery: desktop, Virtual Desktop, Quest 3 standalone
- Performance budgets: 500K-800K Gaussians Quest 3, 1M desktop
- Build philosophy: validate thesis first, then build
- Quality gates: bash -n, ruff, mypy, tsc --noEmit, npm run build, ESLint zero warnings

---

## 2. Project Goals & Product Architecture

### Primary Goal

Create an end-to-end system for converting real-world video footage (from any camera) into photorealistic 3D Gaussian Splat scenes, viewable in a browser with WebXR VR support. Target use case: architectural and real estate visualization. The system must run on any NVIDIA GPU machine without manual configuration.

### Two Products, One Codebase (Monolith-First)

**Product 1 — VR Scout Studio (the monolith)**
The full application for processing and viewing splats. All pipeline orchestration, training management, QA tools, and viewer integrated into one application.

**Product 2 — VR Scout Viewer (extracted component)**
A self-contained React component that takes a scene config and renders it. Designed to be embedded in any website.

```typescript
interface ViewerProps {
  sceneConfig: SceneConfig;
  enableVR?: boolean;
  enableControls?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;
}
```

**The boundary rule:** If code references the FastAPI server, job queue, file system paths, or training parameters, it belongs to Product 1. If code only needs an SPZ URL, alignment data, and renderer config, it belongs to the viewer component.

### Constraints (non-negotiable)

- 100% open-source toolchain (no Luma AI, no Postshot, no non-commercial licensed tools)
- Must run on any NVIDIA GPU machine (RTX 3060 through RTX 5090)
- Viewer stack: React 19, React Three Fiber, Three.js, Vite, TypeScript strict mode
- Desktop-first product with VR as a feature
- Quest 3 compatibility for portable/standalone VR mode
- All environment variables use `VRS_` prefix
- Machine-specific config must not be committed to git

---

## 3. History & Lessons Learned

### Iteration 1 — Custom WebGPU Shader (Abandoned)
WebGPU+WebXR bindings not available on Quest Browser. Premature without a WebGL2 fallback. Do not revisit until Quest Browser supports WebGPU+WebXR.

### Iteration 2 — Triangle Splats (Abandoned)
Not competitive with standard 3DGS for real-world reconstruction. No production toolchain exists. Do not revisit.

### Iteration 3 — Standard Splats with SPZ / Spark (v3 base)
Correct direction. Problems were: using Nerfstudio instead of gsplat directly, using the spz Python library (circular import bug), insufficient training with default ADC densification, no gravity/floor alignment pipeline, no metadata extraction, hardcoded environment paths.

### Key learnings from v3 development

**COLMAP settings for DJI footage:** SIMPLE_RADIAL camera model + exhaustive matching dramatically outperforms sequential matching for gimbal-stabilized footage (registration jumped from ~3 images to 261/305). Scene-change filter `gt(scene,0.1)` is too aggressive for gimbal-stabilized footage — must be lowered to 0.02-0.04 or disabled entirely.

**gsplat invocation:** Always `python examples/simple_trainer.py`, NOT `python -m gsplat.simple_trainer`.

**PLY→SPZ conversion:** Use 3dgsconverter, not the `spz` Python library (circular import bug in `spz`).

**Architecture boundary:** Project files on Windows filesystem; React client runs on Windows via npm; FastAPI + all pipeline tools (COLMAP, gsplat, ffmpeg, conda) must run inside WSL Ubuntu.

**SPZ over SOG:** SOG's compression advantage is negligible at VR Scout's scene sizes; SH palette clustering introduces lossy banding on architectural surfaces.

**Static audits are insufficient:** Code audits that only perform static analysis miss integration bugs; audits should walk through actual user flows.

**CUDA portability:** fused-ssim and gsplat custom CUDA kernels require source builds on newer GPUs (RTX 5090/SM 120/Blackwell). Pre-compiled wheels are a portability trap.

**Chunk upload bug:** The upload reassembly in `server/routes/upload.py` may truncate large files — 40 chunks × 5MB = 200MB instead of full 1.7GB. This must be fixed at the infrastructure level.

### What Marble by World Labs validated

World Labs' Marble product (launched November 2025, $5B valuation as of February 2026) uses the exact same delivery stack: 3D Gaussian Splatting, SPZ/PLY exports, the Spark renderer (which they open-sourced), and WebXR on Quest 3. Their lightweight export targets 500K splats — identical to our Quest 3 budget. Their full-resolution export is 2M splats (desktop). This is independent validation from the team that invented NeRF (Ben Mildenhall) and laid groundwork for 3DGS (Christoph Lassner/Pulsar) that our toolchain choices are correct.

Key distinction: Marble generates synthetic environments from text/images. VR Scout reconstructs real environments from video footage. These serve different moments in the same market (architectural/real estate visualization). VR Scout's photorealism from real footage is a genuine differentiator — the UploadVR review noted Marble's quality was "noticeably inferior" to capture-based approaches for hallucinated details.

---

## 4. Hardware-Adaptive Environment System

### The Problem

v3 broke on every new machine because paths, CUDA versions, and pre-compiled wheels were hardcoded. The v4 environment system detects hardware and adapts automatically.

### setup_environment.sh

This script runs once on initial setup and can be re-run safely after hardware changes. It performs:

**GPU Detection:**
- GPU model, compute capability (SM architecture), VRAM via `nvidia-smi`
- Driver version and maximum supported CUDA version
- Compatibility validation: SM 89 needs CUDA 11.8+, SM 120 needs CUDA 12.8+

**CUDA Toolkit Detection:**
- Finds installed CUDA toolkit (checks `/usr/local/cuda*/`, conda paths, nvcc)
- Validates toolkit version against GPU compute capability
- Sets `CUDA_HOME` dynamically — writes to conda activation script at `~/miniconda3/envs/splat/etc/conda/activate.d/cuda.sh`
- Never hardcodes a path

**Hardware Profile Selection:**

| Profile | VRAM | data_factor | max_steps | depth_model | segmentation | perceptual_pruning |
|---------|------|-------------|-----------|-------------|--------------|-------------------|
| Full | ≥16GB | 1 | 30,000 | Large | Yes | Yes |
| Standard | 8-16GB | 1 | 30,000 | Base | Optional | Simplified |
| Constrained | ≤8GB | 2 | 20,000 | Small | Skip | Skip (use SOR) |

**Package Installation:**
- Selects correct PyTorch wheel for detected CUDA version
- Builds gsplat from source (`pip install gsplat --no-binary :all:`) against local hardware
- Builds fused-ssim from source
- Installs 3dgsconverter from source
- Installs Depth Anything V2/V3
- Installs SAM 2 (if Full profile)
- Clones gsplat repo for `examples/simple_trainer.py`

**Smoke Tests:**
```bash
python -c "import torch; assert torch.cuda.is_available(); print(f'PyTorch CUDA: {torch.version.cuda}')"
python -c "import gsplat; print(f'gsplat: {gsplat.__version__}')"
python -c "import fused_ssim; print('fused-ssim: OK')"
python -c "from depth_anything_v2.dpt import DepthAnythingV2; print('DepthAnything: OK')"
colmap help | head -3
ffmpeg -version | head -1
3dgsconverter --help 2>&1 | head -3
```

**Output:**
- `ENVIRONMENT.md` at project root documenting everything detected
- Hardware profile written to `config/hardware_profile.json`
- Conda activation script with dynamic `CUDA_HOME`
- All paths resolved and stored — no hardcoding anywhere downstream

**Re-runnable:** Safe to run again after GPU swap, CUDA upgrade, or conda environment rebuild.

---

## 5. The Complete Tech Stack

### Capture

| Component | Tool | Notes |
|-----------|------|-------|
| Primary camera | DJI Osmo Pocket 3 | 4K/30fps, locked exposure/WB, gimbal stabilization |
| Drone capture | Any DJI drone with SRT sidecar | GPS + gimbal telemetry for alignment and scale |
| 360° supplementary | Insta360, Ricoh Theta, etc. | Optional coverage enhancement, environment maps |
| Phone capture | iPhone/Android | Supported — CAMM/CMMotion metadata extracted if present |
| DSLR capture | Any camera | Supported — no metadata expected, full fallback chain |
| Settings | Standard color profile | Never D-Log or HLG — inconsistent exposure causes floaters |
| Extraction | ffmpeg | 2 FPS, scene-change threshold 0.02 (configurable, default for DJI) |

### Structure from Motion (SfM)

| Component | Tool | Notes |
|-----------|------|-------|
| SfM | COLMAP 4.x | Feature extraction + matching, gravity prior support |
| Camera model | SIMPLE_RADIAL (default) | Configurable; OPENCV available for A/B testing |
| Matcher | Exhaustive (default) | Spatial matcher auto-enabled when GPS priors available from SRT |
| Single camera flag | --single_camera 1 | All video frames share one camera intrinsic |
| Gravity priors | Via universal metadata extractor | Injected into COLMAP database before reconstruction |
| Alignment | colmap model_orientation_aligner | Fallback when gravity priors unavailable |

> **COLMAP 4.x Update:** GLOMAP global SfM has been integrated into COLMAP as a first-class alternative via `global_mapper` and `automatic_reconstructor --mapper GLOBAL` commands. Gravity priors are now supported natively in the COLMAP database. ALIKED feature extraction is available via ONNX, with LightGlue matching support.

### Generative AI Enhancement

| Component | Tool | Notes |
|-----------|------|-------|
| Depth estimation | Depth Anything V2/V3 | Monocular depth on all frames → depth supervision in training |
| Segmentation | SAM 2 | Background/sky masking for outdoor scenes (optional) |
| Perceptual pruning | LPIPS | Guided Gaussian removal for budget targeting |
| Mesh extraction | SuGaR or gsplat native | Floor plane, collision mesh, VR teleportation surfaces |

### Training

| Component | Tool | Notes |
|-----------|------|-------|
| Trainer | gsplat (direct) | Latest stable (1.5.3+), built from source per machine |
| Strategy | MCMC densification | More efficient than ADC; adapts Gaussian count |
| Depth supervision | --depth_loss | Uses Depth Anything depth maps from Step 2 |
| Exposure compensation | --use_bilateral_grid or PPISP | PPISP is Jan 2026 gsplat addition; evaluate both |
| Iterations | 30,000 (target, hardware-adaptive) | Constrained profile: 20,000 |
| SH degree | 1 (default), configurable per-scene | SH1 for diffuse interiors; allow SH2/3 for specular |

> **Correct gsplat invocation:**
> ```bash
> python examples/simple_trainer.py mcmc \
>   --data_dir ./scene \
>   --result_dir ./output \
>   --use_bilateral_grid \
>   --depth_loss \
>   --max_steps 30000
> ```

### Post-Training Cleanup & Conversion

| Component | Tool | Notes |
|-----------|------|-------|
| Automated culling | 3dgsconverter | SOR, opacity culling, density filtering, bbox crop |
| Perceptual pruning | Custom (LPIPS-guided) | Removes Gaussians with no perceptual impact |
| Mesh extraction | SuGaR / gsplat native | Simplified collision mesh for VR |
| Manual cleanup | SuperSplat | superspl.at (browser-based), MIT |
| Target Gaussians | 500K-800K Quest 3, up to 1M desktop | Two-tier export |

### Compressed Format: SPZ (Final — Not Revisited)

**Decision locked in v3. Rationale unchanged.** SPZ provides ~10x compression, preserves per-Gaussian SH data, has native Spark support, is on the Khronos glTF standardization track, and is proven on Quest 3 via Scaniverse. 3dgsconverter handles PLY→SPZ with GPU acceleration.

### Renderer

| Component | Tool | Notes |
|-----------|------|-------|
| Primary | Spark | WebGL2, MIT license |
| Version | Evaluate Spark 2.0-preview vs 0.1.10 | 2.0 includes LOD octree, SparkXr |
| Scene graph | React Three Fiber v9+ | |
| 3D library | Three.js | Latest stable |
| Build tool | Vite | Latest stable |

> **Check Spark repo for World Labs upstream contributions.** World Labs open-sourced Spark and actively contributes. Recent commits may include Quest 3 performance improvements and WebXR fixes relevant to VR Scout.

### Backend

| Component | Tool | Notes |
|-----------|------|-------|
| API server | FastAPI (Python) | With security fixes from v3 audit |
| Database | SQLite via aiosqlite | `vr_scout.db`, replaced jobs.json from v3 |
| Progress reporting | WebSocket | Structured JSON events per pipeline step |
| Log capture | Per-step log files | `scenes/{id}/logs/step_{N}_{name}.log` |

---

## 6. Input System & Universal Metadata Extraction

### Input Model

The v4 pipeline accepts a layered set of inputs. Video is always required. Everything else is optional and enhances the pipeline when present.

**Required:**
- Video file (.mp4, .mov, .avi) — from any camera

**Optional supplementary inputs:**
- SRT sidecar file — for DJI drone footage (GPS, gimbal orientation, gravity, metric scale)
- 360° photos (.jpg/.png equirectangular) — for coverage gap filling and environment maps
- Both can be provided simultaneously

### Universal Metadata Extractor

The metadata extraction step runs as Step 1 immediately after upload. It inspects the video file and attempts multiple extraction methods in priority order. The system does not ask the user what camera was used — it detects automatically.

**Extraction cascade (tried in order, first success wins per data category):**

| Priority | Method | Catches | Data extracted |
|----------|--------|---------|---------------|
| 1 | ExifTool `-ee` protobuf scan | DJI devices (Pocket 3 via PP-101 proto, drones, Action cameras) | Quaternions, accelerometer, gimbal angles, camera settings |
| 2 | CAMM track detection | Android phones with Google Camera Motion Metadata | Gyroscope, accelerometer, GPS, 3DoF/6DoF pose |
| 3 | GPMF extraction | GoPro cameras | Gyroscope, accelerometer, GPS, orientation |
| 4 | Apple MOV motion metadata | iPhones recording CMMotion data | Gravity vector, rotation rate, user acceleration |
| 5 | Standard EXIF orientation tag | Any camera that records orientation | Coarse gravity hint (portrait/landscape/inverted) |
| 6 | ffprobe stream analysis | Unknown embedded tracks | Best-effort extraction of any timed metadata |

**Critical implementation note for DJI Osmo Pocket 3:** The Pocket 3's telemetry is stored in protobuf-format `djmd` tracks inside the MP4 container, NOT in standard EXIF. ExifTool must be called with the `-ee` flag (extract embedded data from timed metadata) to find it. Without `-ee`, ExifTool only reads file-level EXIF and reports nothing. The v3 metadata extractor likely failed because it didn't use this flag. DJI devices record orientation as quaternions (final computed camera position), not raw IMU data — quaternions are actually better for our use case because they give absolute orientation including gravity direction.

**Extraction command:**
```bash
exiftool -ee -G3 -api largefilesupport=1 -json video.MP4 > metadata_raw.json
```

**SRT sidecar parsing (when provided):**
DJI drone SRT files contain per-frame GPS coordinates (lat/lon/altitude), gimbal pitch/roll/yaw, and flight speed. Parser extracts:
- GPS positions → COLMAP spatial priors (enables `spatial_matcher` for faster matching)
- Gimbal orientation → gravity vectors per frame
- GPS altitude differences → metric scale reference

**360° photo handling (when provided):**
Equirectangular images are held until after COLMAP mapping (Step 5). Then:
1. Split each 360° image into 6 cubemap faces (front, back, left, right, top, bottom) using standard equirectangular→cubemap projection
2. Register cubemap faces into existing COLMAP model via `colmap image_registrator`
3. Add registered faces to training image set
4. Optionally render environment cubemap from 360° photo for background replacement in viewer

**Normalized metadata output:**

All extraction methods output to the same structure: `scenes/{id}/metadata/frame_metadata.json`

```json
{
  "source": "dji_protobuf_PP101",
  "device": "DJI Osmo Pocket 3",
  "frames": [
    {
      "frame_index": 1,
      "timestamp_ms": 500,
      "quaternion": [0.998, 0.01, 0.02, -0.04],
      "gravity_vector": [0.01, -9.79, 0.02],
      "accelerometer": [0.1, -9.8, 0.05],
      "gps": null,
      "iso": 200,
      "shutter_speed": "1/500",
      "white_balance": 5600
    }
  ],
  "has_gravity": true,
  "has_gps": false,
  "has_orientation": true,
  "has_metric_scale": false
}
```

Downstream pipeline steps check the boolean flags and adapt behavior accordingly. Steps never care which camera produced the data.

### Upload UI

The upload screen has three zones:

1. **Video drop zone** (required) — drag-and-drop or click to browse. Chunked upload with progress bar.
2. **Supplementary files expander** (optional) — collapsed by default, with two slots:
   - SRT file slot (single file, auto-detected by `.srt` or `.SRT` extension)
   - 360° photo slot (multiple files, accepts equirectangular `.jpg`/`.png`)
3. **Pipeline configuration panel** — same as v3 with additions for depth model size and segmentation toggle

---

## 7. The Full Pipeline (16 Steps)

### Pipeline Flow Diagram

```
Camera (any device: DJI Pocket 3, drone, phone, DSLR, GoPro)
    + optional SRT sidecar
    + optional 360° photos
          |
          v
    [Step 0] Pre-flight checks
    Read hardware_profile.json from setup_environment.sh
    Verify: CUDA_HOME, nvidia-smi, disk space, conda env, all tools
    GATE: All checks pass → proceed. Any fail → abort with specific error.
          |
          v
    [Step 1] Upload + frame extraction + metadata extraction
    Chunked upload with progress bar (fixed chunk reassembly bug)
    ffmpeg: fps=2, scene-change threshold 0.02 (configurable)
    Universal metadata extractor: try all sources, normalize output
    Parse SRT sidecar if provided
    GATE: Frame count >= 50 (block), >= 150 (recommended)
    Output: scenes/{id}/frames/, scenes/{id}/metadata/
          |
          v
    [Step 2] Depth estimation (NEW — generative)
    Run Depth Anything V2/V3 on all extracted frames
    Model size selected by hardware profile (Large/Base/Small)
    Output: scenes/{id}/depth/frame_00001.png ... frame_NNNNN.png
    GATE: Depth maps generated for all frames
          |
          v
    [Step 3] COLMAP feature extraction
    --camera_model SIMPLE_RADIAL (configurable)
    --single_camera 1
    Inject gravity priors into database if metadata has_gravity=true
    GATE: Features extracted for all images
          |
          v
    [Step 4] COLMAP matching
    Exhaustive by default
    Auto-switch to spatial_matcher if metadata has_gps=true (SRT data)
    Timeout: 60 min for exhaustive (300 frames)
          |
          v
    [Step 5] COLMAP mapping
    global_mapper if available (GLOMAP integrated), else incremental mapper
    GATE: Registration rate >= 90% (warn at 50-89%, block at < 50%)
    GATE: Handle multiple models (select largest, warn user)
    Output: scenes/{id}/sparse/0/
          |
          v
    [Step 5.5] 360° photo registration (NEW — conditional)
    Only runs if 360° photos were uploaded
    Split equirectangular → cubemap faces
    Register into existing COLMAP model via image_registrator
    Add registered faces to frame set
    Output: updated sparse model, additional training images
          |
          v
    [Step 6] Gravity alignment
    PRIMARY: Use gravity priors from metadata (if available)
    FALLBACK 1: colmap model_orientation_aligner (Manhattan world)
    FALLBACK 2: Deferred to Step 12 mesh-based floor detection
    GATE: Check if transform is non-identity. If identity, flag for mesh fallback.
    Output: scenes/{id}/aligned/
          |
          v
    [Step 7] Validation checkpoint
    Report: registration rate, reprojection error, point cloud density,
            camera model, image count, estimated scene scale, alignment status
    UI: Display validation report with sparse point cloud preview
    User confirms "Proceed to training" or adjusts and re-runs Steps 3-6
    GATE: User approval required
          |
          v
    [Step 8] Background segmentation (NEW — optional, generative)
    Only runs if enabled (default: on for outdoor/mixed, off for pure interior)
    SAM 2 on training frames → per-frame masks
    Mask classes: sky, distant buildings, ground beyond area of interest
    Moving object detection and masking
    Skipped on Constrained hardware profile
    Output: scenes/{id}/masks/frame_00001.png ... frame_NNNNN.png
          |
          v
    [Step 9] Training
    gsplat MCMC with:
      --depth_loss (using Step 2 depth maps)
      --use_bilateral_grid (or PPISP — evaluate both)
      --max_steps from hardware profile
    Mask supervision from Step 8 if available
    VRAM-adaptive defaults (data_factor, cap_max from hardware profile)
    LIVE METRICS: iteration, loss, PSNR, Gaussian count, GPU mem, ETA
    GATE: Training completes without OOM or NaN loss
    Output: scenes/{id}/output/point_cloud.ply
          |
          v
    [Step 10] Perceptual pruning (NEW — generative, hardware-adaptive)
    LPIPS-guided Gaussian removal:
      Render from training viewpoints
      Iteratively remove Gaussians whose absence causes no perceptual loss
      Target configurable budget (default: 800K desktop, 500K Quest)
    On Constrained profile: skip, use 3dgsconverter SOR instead
    Output: scenes/{id}/output/point_cloud_pruned.ply
          |
          v
    [Step 11] Mesh extraction (NEW)
    Extract simplified collision mesh from trained Gaussians
    Auto-detect floor plane (dominant horizontal surface)
    If gravity alignment in Step 6 failed (identity), apply mesh-based correction
    Generate: floor plane for VR teleportation, bounding geometry, Y=0 from floor
    Output: scenes/{id}/output/collision_mesh.glb, floor_plane.json
          |
          v
    [Step 12] Two-tier SPZ conversion (ENHANCED)
    Run 3dgsconverter twice:
      Desktop SPZ: full fidelity, moderate culling
      Quest SPZ: aggressive --sor_intensity, --min_opacity, Gaussian cap
    Apply visual bounding box crop if user defined one
    Coordinate system conversion: RDF → RUB
    GATE: Verify both SPZ files exist, size > 1KB, Gaussians within budget
    Output: scenes/{id}/output/scene_desktop.spz, scene_quest.spz
          |
          v
    [Step 13] Camera-path video render (NEW)
    Render smooth flythrough MP4 along COLMAP camera path
    Interpolate between camera positions for smooth motion
    Configurable resolution (1080p default) and duration
    Output: scenes/{id}/output/flythrough.mp4
          |
          v
    [Step 14] Generate alignment.json
    Combine: gravity prior transform (Step 6) + mesh floor correction (Step 11)
    Write final alignment transform
    Include: scene scale (metric if available), floor Y offset, scene bounds
    Output: scenes/{id}/output/alignment.json
          |
          v
    [Step 15] QA Review (ENHANCED)
    3D viewer with Spark renderer
    Camera path overlay (colored by registration quality)
    Mesh overlay (collision geometry, floor plane)
    Auto-detected floor plane with manual adjustment gizmo
    Bounding box crop editor (visual, 3D)
    Side-by-side desktop/Quest SPZ preview
    Flythrough video playback
    User approves or adjusts → regenerate alignment/conversion
    [Enter VR] [Export Desktop SPZ] [Export Quest SPZ] [Download Video]
```

### Orchestration Architecture

The pipeline is orchestrated by FastAPI calling individual Python functions (not a monolithic bash script). Each step is:
- An async function in `server/pipeline/steps/`
- Writes structured status to SQLite via `update_step_status()`
- Captures stdout/stderr to per-step log files
- Pushes updates over WebSocket
- Has an explicit exit code: 0 (pass), 1 (warning), 2 (block)

This replaces the v3 `process.sh` bash script, which had issues with error handling and was not cross-platform testable.

```python
# server/pipeline/steps/step_02_depth.py
async def run_depth_estimation(scene_id: str, config: PipelineConfig) -> StepResult:
    """Run Depth Anything on all extracted frames."""
    profile = load_hardware_profile()
    model_size = profile.depth_model  # "Large", "Base", or "Small"
    frames_dir = get_scene_path(scene_id, "frames")
    depth_dir = get_scene_path(scene_id, "depth")
    # ... implementation
```

---

## 8. Pipeline Observability & Error Handling

### 8.1 Status Tracking

v4 uses SQLite for status tracking (not a status.json file polled from disk). The `pipeline_runs` and `step_statuses` tables are the source of truth. WebSocket pushes real-time updates to the React UI.

**Status values and UI treatment:** Same as v3 (running, completed, failed, warning, blocked, awaiting_confirmation, awaiting_review).

### 8.2 Per-Step Log Capture

Every step writes to `scenes/{id}/logs/step_{N}_{name}.log`. UI provides "View Log" button per step. Last 200 lines shown with "Load More" for full log.

### 8.3 Training Metrics Stream

Same as v3 but with additions:
- Depth loss value (when depth supervision active)
- Mask coverage percentage (when segmentation active)
- GPU memory as bar indicator with >90% warning

### 8.4 Hang Detection

Same per-step expected durations as v3, extended for new steps:

| Step | Expected Duration | Warn Threshold (3×) |
|------|-------------------|---------------------|
| 0. Pre-flight | < 5s | 15s |
| 1. Upload + extraction + metadata | 30s - 3min | 9min |
| 2. Depth estimation | 2-15min | 45min |
| 3. Feature extraction | 2-10min | 30min |
| 4. Matching (exhaustive) | 5-30min | 90min |
| 5. Mapping | 5-60min | 180min |
| 5.5. 360° registration | 1-5min | 15min |
| 6. Gravity alignment | < 30s | 90s |
| 7. Validation | < 10s | 30s |
| 8. Background segmentation | 5-20min | 60min |
| 9. Training (30K) | 30-120min | 360min |
| 10. Perceptual pruning | 5-30min | 90min |
| 11. Mesh extraction | 2-10min | 30min |
| 12. SPZ conversion (×2) | 2-10min | 30min |
| 13. Video render | 5-30min | 90min |
| 14. Alignment generation | < 5s | 15s |
| 15. QA Review | User-driven | N/A |

### 8.5 Validation Gates

All v3 gates carry forward, plus new ones:

| Gate | Check | Pass | Fail Action |
|------|-------|------|-------------|
| After Step 2 | Depth maps exist for all frames | All present | Block — depth model failed |
| After Step 8 | Mask coverage is reasonable | >10% pixels masked | Warn — segmentation may not have detected background |
| After Step 9 | Final PSNR with depth supervision | > 22 dB | Warn — lower than expected |
| After Step 10 | Gaussian count within budget | Within target range | Warn — may need manual pruning |
| After Step 11 | Floor plane detected | Non-degenerate plane | Warn — manual alignment needed |
| After Step 12 | Both SPZ files valid | Size > 1KB, < 50MB Quest tier | Block/warn per tier |

---

## 9. Scale, Leveling & Alignment Strategy

### The Core Problem

COLMAP reconstructs in an arbitrary coordinate system. It doesn't know which way is "up" or what real-world scale is. Every other splat viewer that "just works" either uses IMU/gravity data from the capture device or has a manual alignment step built in.

### The v4 Solution: Four-Layer Alignment Cascade

The pipeline attempts alignment methods in priority order. Each layer adds confidence; later layers are fallbacks for earlier failures.

**Layer 1 — Device gravity priors (best, zero post-processing)**

If the universal metadata extractor found gravity data (quaternions, gravity vectors, or gimbal orientation from any supported device), inject it into COLMAP's database as gravity priors before reconstruction. COLMAP 4.x natively supports gravity in pose priors. The reconstruction is gravity-aligned from the start.

For SRT-equipped drone footage, GPS positions provide metric scale as well.

**Layer 2 — COLMAP model_orientation_aligner (decent, sometimes fails)**

Manhattan world assumption via vanishing point detection. Works well for architectural interiors with orthogonal walls. Fails (returns identity transform) on irregular spaces, curved architecture, or outdoor scenes. This is the v3 approach — it's now a fallback, not the primary mechanism.

**Layer 3 — Mesh-based floor detection (always works, requires training)**

After training (Step 11), extract a simplified mesh from the Gaussian field. Detect the dominant horizontal plane as the floor via RANSAC plane fitting. Set Y=0 at the detected floor. This works even when gravity priors are unavailable and Manhattan alignment fails, because it operates on the actual trained geometry.

**Layer 4 — Manual alignment in QA Review (always available)**

Floor grid overlay, Y offset control, Y rotation control, and 4×4 matrix editor for advanced users. The user adjusts and clicks "Apply."

### Scale Calibration

| Source | Method | Accuracy |
|--------|--------|----------|
| SRT GPS altitude | Metric scale from GPS positions | High (±1m) |
| Depth Anything V3 metric mode | Metric depth estimates during training | Moderate (relative scale preserved) |
| Known reference measurement | User clicks two points, enters known distance (e.g., door height = 2.1m) | Exact for that reference |
| None | Arbitrary COLMAP scale | Consistent but not metric |

The QA Review screen includes a "Set Scale" tool where the user clicks two points in the 3D viewer and enters the real-world distance between them. This is the manual fallback that always works.

---

## 10. Generative AI Enhancement Layer

### Design Philosophy

VR Scout's core value is photorealistic reconstruction from real footage. Generative AI is used to *improve reconstruction quality and efficiency*, never to replace or hallucinate scene content. Every generative insertion is clearly bounded: depth priors guide geometry optimization, segmentation removes irrelevant Gaussians, and perceptual pruning compresses without visible loss.

### 10.1 Depth Priors (Step 2)

**What:** Run Depth Anything V2 (or V3 if available) on every extracted frame. Save depth maps alongside the JPEGs.

**Why:** gsplat optimizing with only photometric loss wastes Gaussians on ambiguous geometry — textureless walls, ceilings, and floors produce floaters because the optimizer has no geometric signal. Monocular depth supervision gives the optimizer a geometry target, producing fewer Gaussians for better surfaces. Research shows this particularly helps with texture-less regions and reflective surfaces (DepthSplat, CVPR 2025).

**Integration:** gsplat's `simple_trainer.py` accepts `--depth_loss`. Depth maps are stored as 16-bit PNG grayscale images at the same resolution as training frames.

**Hardware adaptation:** Depth Anything V2 has four model sizes (Small, Base, Large, Giant). Selection based on hardware profile VRAM.

### 10.2 Background Segmentation (Step 8)

**What:** SAM 2 panoptic segmentation on training frames. Produce per-frame masks identifying sky, distant background, moving objects, and other non-target regions.

**Why:** Outdoor and mixed indoor/outdoor scenes waste enormous numbers of Gaussians on sky, distant landscape, and background that doesn't need to be splats. Masking these regions during training means Gaussians are only allocated to the target space. Background is replaced with a lightweight skybox/environment map in the viewer.

**Integration:** gsplat training accepts mask images that zero out loss in masked regions. Gaussians in masked areas receive no gradient signal and are naturally pruned by MCMC.

**Optional:** User toggle in pipeline configuration. Default on for outdoor/mixed, off for pure interiors. Skipped entirely on Constrained hardware profile.

### 10.3 Perceptual Pruning (Step 10)

**What:** After training, render the scene from each COLMAP viewpoint. Iteratively remove candidate Gaussians. Re-render and measure perceptual difference (LPIPS). Gaussians whose removal causes no perceptual change get pruned.

**Why:** 3dgsconverter's statistical pruning (SOR + opacity threshold) is geometry-based — it removes outliers and transparent Gaussians but can't distinguish between visually important and visually redundant Gaussians. Perceptual pruning uses a trained image quality model to make human-vision-aligned decisions about what can be removed.

**Target:** Configurable Gaussian budget. Default: 800K (desktop), 500K (Quest). The pruner removes Gaussians in order of least perceptual impact until the budget is reached.

**Hardware adaptation:** Full profile gets LPIPS-guided pruning. Constrained profile falls back to SOR-only.

### 10.4 Mesh Extraction (Step 11)

**What:** Extract a simplified triangle mesh from the trained Gaussian field. Use SuGaR (Surface-Aligned Gaussian Splatting) or gsplat's native mesh extraction if available.

**Purpose (not rendering — utilities):**
- **Floor plane detection:** RANSAC fit dominant horizontal plane → automatic Y=0 alignment
- **Collision geometry:** Simplified mesh for VR teleportation and collision boundaries
- **Bounding box:** Scene extents for viewer configuration
- **Future:** Mesh export for integration with traditional 3D tools (Unreal, Unity)

---

## 11. UI/UX Design

### 11.1 Application Structure

Same five-screen structure as v3 with enhancements. Persistent left sidebar, main content area.

### 11.2 Screen 1: Scene Dashboard

Same as v3. Scene list with pipeline status, Gaussian count, file sizes. Each scene shows both desktop and Quest SPZ sizes.

### 11.3 Screen 2: Upload & Pipeline Configuration

**Left panel — Upload:**
- Video drop zone (required) — chunked upload, fixed reassembly bug
- "Add supplementary files" expander:
  - SRT file slot (single file)
  - 360° photo slot (multiple files)
- File validation (client-side and server-side)

**Right panel — Configuration:**

| Setting | Default | Options | Notes |
|---------|---------|---------|-------|
| Scene name | Auto from filename | Editable text | |
| Camera model | SIMPLE_RADIAL | SIMPLE_RADIAL / OPENCV | |
| Matcher | Exhaustive | Exhaustive / Sequential / Spatial (auto if GPS) | |
| Training iterations | From hardware profile | Numeric input (min 7000) | |
| SH degree | 1 | 0 / 1 / 2 / 3 | |
| Data factor | From hardware profile | 1 / 2 / 4 | |
| Frame extraction FPS | 2 | 1 / 2 / 3 | |
| Scene change threshold | 0.02 | 0.00 - 0.30 slider | |
| Depth estimation | On | On / Off | |
| Depth model size | From hardware profile | Small / Base / Large | |
| Background segmentation | Auto | On / Off / Auto | Auto = on for outdoor |
| Perceptual pruning | From hardware profile | On / Off | |
| Quest Gaussian budget | 500,000 | Numeric input | |
| Desktop Gaussian budget | 800,000 | Numeric input | |

### 11.4 Screen 3: Pipeline Monitor

Same structure as v3 (step list + training metrics panel) with additions:

- New steps appear in the step list (depth estimation, segmentation, pruning, mesh, video render)
- Steps that are skipped (segmentation off, pruning on constrained hardware) show as "Skipped" in gray
- Depth estimation shows progress per frame (124/305 frames processed)
- Perceptual pruning shows Gaussian count countdown (847K → 500K target)
- Video render shows frame count progress

### 11.5 Screen 4: QA Review (Enhanced)

**3D Viewer (left panel — 70%):**
- Loads desktop SPZ via Spark renderer
- Camera path overlay (colored by registration quality)
- Floor grid overlay at detected Y=0
- Collision mesh overlay (wireframe, toggleable)
- Bounding box crop editor (drag 3D box to define crop region)
- Toggle between desktop and Quest SPZ to compare quality

**Controls panel (right panel — 30%):**

Scene Info section:
- Gaussians (desktop / Quest)
- File sizes (desktop / Quest SPZ)
- SH degree, FPS, depth supervision status

Alignment section:
- Alignment source indicator (gravity prior / Manhattan / mesh / manual)
- Show Floor Grid toggle
- Y offset, Y rotation controls
- Reset / Apply buttons
- Scale calibration tool (click two points, enter known distance)

Overlays section:
- Camera path toggle
- Collision mesh toggle
- Sparse points toggle
- Bounding box crop toggle

Export & Actions section:
- [Enter VR]
- [Export Desktop SPZ]
- [Export Quest SPZ]
- [Download Flythrough Video]
- [Open in SuperSplat]
- [Re-process]

### 11.6 Screen 5: Settings

Same as v3 with additions:

| Setting | Default | Notes |
|---------|---------|-------|
| Hardware profile | Auto-detected | Display only (re-run setup_environment.sh to change) |
| Default depth model | Auto (from profile) | Override: Small / Base / Large |
| Default segmentation | Auto | On / Off / Auto |
| Default perceptual pruning | Auto (from profile) | On / Off |
| Flythrough video resolution | 1080p | 720p / 1080p / 4K |
| Flythrough video duration | Auto (from camera path) | Override: 15s / 30s / 60s |

---

## 12. Renderer Architecture

### Spark (WebGL2) — Evaluate 2.0

Same evaluation criteria as v3:
1. Can SparkXr enter immersive-vr on Quest Browser?
2. Does LOD octree reduce peak GPU memory for large scenes?
3. Is FPS >= 72 at 500K Gaussians on Quest 3 standalone?
4. Can SPZ files be loaded directly?
5. Is the npm package stable?

If Spark 2.0 LOD works, it eliminates the need for a custom zone manager.

### Scene Orientation Layer

```typescript
const alignment = await fetch(config.alignmentUrl).then(r => r.json());
splatMesh.matrix.fromArray(alignment.transform);
splatMesh.matrixAutoUpdate = false;

// If collision mesh available, load for VR teleportation
if (config.collisionMeshUrl) {
  const mesh = await loadGLB(config.collisionMeshUrl);
  mesh.visible = false; // invisible but used for raycasting
  scene.add(mesh);
}
```

### Per-Eye Sorting for VR

Same as v3 — center-eye sorting causes depth popping in stereo VR. Spark supports multiple viewpoints.

---

## 13. VR Delivery Strategy

### Three Delivery Modes (unchanged from v3)

**Mode 1: Desktop Browser** — Full fidelity, up to 1M splats, orbit/fly controls
**Mode 2: Virtual Desktop → Quest 3** — Full fidelity wireless VR via desktop Chrome
**Mode 3: Quest 3 Standalone** — 500K-800K Gaussians, CPU sort, under 50MB SPZ

### Additional Delivery: Flythrough Video

New in v4. Camera-path video render (Step 13) produces an MP4 shareable without any viewer. This is the primary sharing mechanism for clients who don't own VR hardware.

### Validated VR Targets

- Meta Quest 3 (primary, confirmed via v3 testing and Marble precedent)
- Apple Vision Pro (WebXR via Safari, zero additional renderer work, validated by Marble)

---

## 14. Performance Budgets & Constraints

### Desktop (Spark/WebGL2)

| Metric | Target |
|--------|--------|
| Gaussians | Up to 1M |
| File size (SPZ) | 12-50MB |
| Frame time | < 16ms (60 FPS) |
| SH degree | 1 (configurable) |

### Quest 3 Standalone (Spark/WebGL2)

| Metric | Target |
|--------|--------|
| Gaussians | 500K-800K max |
| File size (SPZ) | Under 50MB |
| Frame time | < 14ms (72 FPS) |
| SH degree | 1 |
| maxStdDev | Math.sqrt(5) |

### Mobile Browser (Viewer only)

| Metric | Target |
|--------|--------|
| Gaussians | 300K max |
| File size (SPZ) | Under 20MB |
| Frame time | < 33ms (30 FPS) |

---

## 15. Custom Code You Own

### setup_environment.sh
Hardware detection, dynamic CUDA_HOME, source builds, smoke tests, profile selection.

### Universal metadata extractor (Python module)
Cascade of ExifTool protobuf, CAMM, GPMF, Apple MOV, EXIF extraction. Normalized per-frame JSON output.

### SRT parser (Python module)
DJI drone SRT sidecar parser → GPS positions, gimbal orientation, gravity vectors.

### 360° photo processor (Python module)
Equirectangular → cubemap splitting, COLMAP image_registrator integration.

### Depth estimation runner (Python module)
Depth Anything V2/V3 batch inference on frames, hardware-adaptive model selection.

### Background segmentation runner (Python module)
SAM 2 panoptic segmentation, mask generation, moving object detection.

### Perceptual pruner (Python module)
LPIPS-guided Gaussian removal, budget-targeted iterative pruning.

### Mesh extractor (Python module)
SuGaR or equivalent wrapper, RANSAC floor plane detection, collision mesh export.

### Camera-path video renderer (Python module)
COLMAP pose interpolation, gsplat render-from-pose, ffmpeg MP4 assembly.

### validate_colmap.py
Same as v3. JSON report with registration rate, reprojection error, alignment status.

### Pipeline orchestrator (FastAPI + async Python)
Replaces process.sh. Per-step async functions with SQLite status tracking, WebSocket updates, error pattern detection.

### SceneRenderer.tsx (extractable viewer core)
Same as v3 with additions: collision mesh loading, two-tier SPZ selection (desktop/Quest), environment map for background.

### Pipeline UI Components (React)
All v3 components plus: DepthEstimationProgress, SegmentationPreview, PruningProgress, BoundingBoxCropEditor, ScaleCalibrationTool, FlythroughVideoPlayer, DesktopQuestToggle.

### FastAPI Endpoints
All v3 endpoints plus:
- `POST /api/upload/supplementary/{scene_id}` — SRT and 360° files
- `GET /api/scene/{scene_id}/depth/{frame}` — depth map visualization
- `GET /api/scene/{scene_id}/masks/{frame}` — segmentation mask
- `GET /api/scene/{scene_id}/mesh` — collision mesh GLB
- `GET /api/scene/{scene_id}/video` — flythrough MP4
- `PUT /api/scene/{scene_id}/crop` — bounding box crop coordinates
- `PUT /api/scene/{scene_id}/scale` — manual scale calibration

---

## 16. Build Order

### Phase 0 — Hardware-Adaptive Environment System (3-5 days)
1. Write `setup_environment.sh` with GPU detection, CUDA validation, dynamic paths
2. Implement hardware profile selection (Full/Standard/Constrained)
3. Source build all CUDA-dependent packages
4. Smoke tests for every component
5. Test on RTX 4070 (primary) and RTX 5090 (lab)
6. Write `ENVIRONMENT.md` template
7. **Decision gate:** Environment installs cleanly on both machines without manual intervention.

### Phase 1 — Core Pipeline Rebuild (7-10 days)
1. FastAPI pipeline orchestrator (replace process.sh with async Python steps)
2. SQLite job tracking (replace jobs.json)
3. Fix chunk upload reassembly bug
4. Fix scene-change filter default (0.02 for DJI)
5. Universal metadata extractor (ExifTool protobuf, CAMM, GPMF, Apple, EXIF cascade)
6. SRT parser integration
7. Steps 0-7 (preflight through validation) working end-to-end
8. Steps 12, 14, 15 (SPZ conversion, alignment, QA review) working
9. WebSocket status + log streaming
10. Re-process library_area with corrected pipeline
11. Test on Quest 3
12. **Decision gate:** Pipeline produces a viewable, correctly-oriented scene from video input. No command line needed.

### Phase 2 — Depth Priors (3-5 days)
1. Install Depth Anything V2/V3 with hardware-adaptive model selection
2. Implement Step 2 (batch depth estimation on all frames)
3. Wire depth maps into gsplat training via `--depth_loss`
4. Compare: library_area with vs without depth supervision (PSNR, visual quality, Gaussian count)
5. **Decision gate:** Depth-supervised training produces measurably better surfaces on textureless areas.

### Phase 3 — Gravity & Scale Fix (5-7 days)
1. Validate Pocket 3 metadata extraction (ExifTool `-ee` on actual footage)
2. Implement COLMAP gravity prior injection from extracted metadata
3. Implement SRT → COLMAP spatial prior injection
4. Test alignment cascade: gravity priors → Manhattan → mesh fallback
5. Implement manual scale calibration tool in QA Review
6. **Decision gate:** Scenes from Pocket 3 footage are automatically leveled. Scenes from drone footage are leveled AND scaled.

### Phase 4 — Background Segmentation (3-5 days)
1. Install SAM 2
2. Implement Step 8 (per-frame mask generation)
3. Wire masks into gsplat training
4. Test on outdoor_rooftop scene — measure Gaussian count reduction
5. Implement viewer environment map fallback for masked regions
6. **Decision gate:** Outdoor scenes have 30%+ fewer Gaussians without visible quality loss.

### Phase 5 — Perceptual Pruning (3-5 days)
1. Implement LPIPS-guided pruning loop
2. Budget targeting (configurable desktop/Quest targets)
3. Compare: SOR-only vs perceptual pruning at same Gaussian count
4. Test Quest 3 performance at 500K perceptually-pruned vs 500K SOR-pruned
5. **Decision gate:** Perceptual pruning produces visibly better quality at the same budget.

### Phase 6 — Mesh Extraction & Auto Floor (3-5 days)
1. Evaluate SuGaR vs gsplat native mesh extraction
2. Implement Step 11 (mesh extraction + RANSAC floor detection)
3. Wire floor plane into alignment.json
4. Collision mesh loading in viewer for VR teleportation
5. **Decision gate:** Floor plane is correctly detected on library_area without manual intervention.

### Phase 7 — Two-Tier Export & Video Render (3-5 days)
1. Implement dual 3dgsconverter runs with different parameters
2. Bounding box crop editor in QA Review
3. Camera-path video renderer (COLMAP pose interpolation + gsplat rendering + ffmpeg)
4. Desktop/Quest toggle in QA Review viewer
5. **Decision gate:** Users can download desktop SPZ, Quest SPZ, and flythrough video from a single pipeline run.

### Phase 8 — 360° Photo Support (3-5 days)
1. Equirectangular → cubemap splitting
2. COLMAP image_registrator for adding 360° faces to existing model
3. Upload UI for supplementary 360° photos
4. Environment map generation from 360° photo for viewer background
5. **Decision gate:** Adding 360° photos to a pipeline run measurably improves coverage gaps.

### Phase 9 — UI Polish & Full Integration (5-7 days)
1. All 5 screens updated for new pipeline steps
2. New UI components: depth progress, segmentation preview, pruning progress, crop editor, scale tool, video player, desktop/quest toggle
3. End-to-end test: upload video + SRT + 360° → monitor pipeline → review scene → enter VR → export all formats
4. **Decision gate:** A non-technical user can process a scene from video to VR without touching the command line.

### Phase 10 — Cross-Machine Validation (3-5 days)
1. Run setup_environment.sh on RTX 5090 lab machine
2. Process library_area end-to-end on lab machine
3. Compare outputs: lab machine vs primary machine
4. Fix any portability issues discovered
5. Document any machine-specific deviations
6. **Decision gate:** Identical pipeline results on both machines with zero manual configuration.

### Phase 11 — Security & Production (3-5 days)
1. Fix command injection (create_subprocess_shell → create_subprocess_exec)
2. Fix path traversal on upload
3. Fix XSS via inline HTML interpolation
4. Upload size limits (server-side: 20GB max)
5. Rate limiting on API endpoints
6. HTTPS configuration

### Future Phases
- Spark 2.0 LOD evaluation and migration
- Viewer extraction as standalone npm package
- Custom WebGPU renderer (after product thesis validated)
- Quest 3 standalone optimization pass

---

## 17. Known Failure Modes & User-Facing Error Map

All v3 error mappings carry forward. New additions:

### Depth Estimation

| Problem | Detection | User Message | Action |
|---------|-----------|-------------|--------|
| Depth model OOM | CUDA OOM during inference | "Depth model too large for your GPU. Switching to smaller model." | Auto-retry with next smaller model |
| Depth maps missing | Some frames have no output | "Depth estimation failed on {N} frames. Training will proceed without depth on those frames." | Continue (graceful degradation) |

### Segmentation

| Problem | Detection | User Message | Action |
|---------|-----------|-------------|--------|
| No background detected | Mask is 100% foreground | "No background detected — this may be a pure interior scene. Segmentation skipped." | Skip segmentation |
| Excessive masking | Mask > 80% of image | "Segmentation masked most of the image. This may remove important scene content." | Warn, offer to disable |

### Perceptual Pruning

| Problem | Detection | User Message | Action |
|---------|-----------|-------------|--------|
| Cannot reach budget | LPIPS increases before target reached | "Could not reach {target}K Gaussians without visible quality loss. Stopped at {actual}K." | Warn, proceed with higher count |

### Mesh Extraction

| Problem | Detection | User Message | Action |
|---------|-----------|-------------|--------|
| No floor plane found | RANSAC fails to fit horizontal plane | "Could not automatically detect floor plane. Use manual alignment in QA Review." | Fall through to manual |
| Mesh extraction fails | Tool crashes | "Mesh extraction failed. VR teleportation and auto-floor detection unavailable." | Skip, proceed without mesh |

### Metadata Extraction

| Problem | Detection | User Message | Action |
|---------|-----------|-------------|--------|
| No metadata found | All extraction methods return empty | "No orientation metadata detected in video. Scene will use geometric alignment (may require manual adjustment)." | Proceed with fallback alignment chain |
| Partial metadata | Some fields populated, others not | (No message — transparent to user) | Use available fields, skip unavailable |

---

## 18. A/B Test Protocol

### Test Infrastructure

Same as v3: fixed evaluation viewpoints, metrics capture script, Quest 3 FPS logger.

### Tests from v3 (carry forward if not yet completed)

- Test 1: Camera model (OPENCV vs SIMPLE_RADIAL)
- Test 2: Matcher (Sequential vs Exhaustive)
- Test 3: 30K MCMC vs existing ADC checkpoint
- Test 4: Spark 2.0-preview viability

### New v4 Tests

**Test 5: Depth supervision impact**
- Train library_area with and without `--depth_loss`
- Compare: PSNR, SSIM, Gaussian count at convergence, visual quality on textureless walls
- Measure: training time impact

**Test 6: Bilateral grid vs PPISP**
- gsplat added PPISP in January 2026 as an alternative to bilateral grid
- Train same scene with both, compare quality and training speed

**Test 7: Perceptual pruning vs SOR-only**
- Prune to same Gaussian count (500K) using both methods
- Compare: LPIPS, visual inspection, Quest 3 FPS

**Test 8: Depth Anything V2 vs V3**
- If V3 is available by implementation time, compare both as depth supervision source
- V3 adds multi-view consistency which may better align with COLMAP-derived training views

---

## 19. Future Roadmap

### Near-term
- Generative inpainting for artifact cleanup (auto-detect + inpaint floaters/reflections)
- Super-resolution upscaling (capture at 1080p, upscale to 4K for training)
- Synthetic view generation for sparse regions (Zero-1-to-3++ for gap filling)
- DJI Terra integration investigation (DJI's own SfM output as COLMAP alternative)

### Medium-term
- Full 360° primary capture support (SphereSfM or COLMAP 360 when mature)
- Multi-room scene support with zone streaming (if Spark 2.0 LOD insufficient)
- Mesh extraction for full scene export (Unreal/Unity/Blender integration)
- KHR_gaussian_splatting ratification and native glTF export
- Custom WebGPU renderer for desktop VR tier

### Formats to watch
- L-GSC (Qualcomm) — competing Khronos compression proposal
- glTF-embedded Gaussians — SPZ-inside-glTF after ratification
- Mobile-GS (ICLR 2026) — real-time GS on mobile devices via Vulkan

---

## 20. References

### Core Tools

| Tool | URL | License |
|------|-----|---------|
| gsplat | https://github.com/nerfstudio-project/gsplat | Apache 2.0 |
| COLMAP | https://github.com/colmap/colmap | BSD-3 |
| SuperSplat | https://github.com/playcanvas/supersplat | MIT |
| Spark renderer | https://github.com/sparkjsdev/spark | MIT |
| 3dgsconverter | https://github.com/francescofugazzi/3dgsconverter | MIT |
| Depth Anything V2 | https://github.com/DepthAnything/Depth-Anything-V2 | Apache 2.0 |
| Depth Anything V3 | https://depth-anything-3.github.io/ | TBD |
| SAM 2 | https://github.com/facebookresearch/sam2 | Apache 2.0 |
| SuGaR | https://github.com/Anttwo/SuGaR | License varies |
| ExifTool | https://exiftool.org/ | Perl Artistic |
| SphereSfM | https://github.com/json87/SphereSfM | BSD-3 |

### Research

| Paper | URL | Relevance |
|-------|-----|-----------|
| DepthSplat (CVPR 2025) | https://github.com/cvg/depthsplat | Depth Anything + Gaussian Splatting |
| Splatter-360 (CVPR 2025) | https://github.com/thucz/splatter360 | 360° panoramic GS |
| SPaGS | https://doi.org/10.1111/cgf.70171 | Spherical panorama GS |
| Mobile-GS (ICLR 2026) | https://github.com/xiaobiaodu/Mobile-GS | Real-time mobile GS |
| StableGS | https://arxiv.org/html/2503.18458 | Why floaters form |
| StopThePop | https://r4dl.github.io/StopThePop/ | Stereo sorting artifacts |
| gsplat (JMLR 2025) | https://arxiv.org/html/2409.06765v1 | Trainer reference |
| Google CAMM spec | https://developers.google.com/streetview/publish/camm-spec | Camera motion metadata |

---

## 21. Appendices

### Appendix A: Environment Setup

```bash
# Clone repo
git clone https://github.com/TheCaffeineDuck/VR-Scout ~/vr-scout-v4

# Run adaptive environment setup (does everything)
cd ~/vr-scout-v4
bash scripts/setup_environment.sh

# This will:
# - Detect GPU and CUDA
# - Create/update conda env 'splat'
# - Build all CUDA packages from source
# - Run smoke tests
# - Write ENVIRONMENT.md and config/hardware_profile.json
# - Set CUDA_HOME in conda activation script
```

### Appendix B: Scene Config (Viewer Interface)

```typescript
interface SceneConfig {
  id: string;
  name: string;
  desktopSpzUrl: string;          // Full-fidelity desktop SPZ
  questSpzUrl: string;            // Quest-optimized SPZ
  alignmentUrl: string;           // alignment.json
  collisionMeshUrl?: string;      // collision_mesh.glb (for VR teleportation)
  environmentMapUrl?: string;     // Cubemap for background (from 360° photo)
  flythroughVideoUrl?: string;    // Camera-path MP4
  gaussianCount: {
    desktop: number;
    quest: number;
  };
  shDegree: 0 | 1 | 2 | 3;
  coordinateSystem: 'rub';
  maxStdDev?: number;             // default: Math.sqrt(5) for Quest 3
  scaleMetric?: boolean;          // true if metric scale was established
  scaleMetersPerUnit?: number;    // conversion factor if metric
}
```

### Appendix C: Hardware Profile Schema

```json
{
  "gpu_name": "NVIDIA GeForce RTX 4070",
  "gpu_vram_gb": 8,
  "compute_capability": "8.9",
  "sm_architecture": 89,
  "cuda_toolkit_version": "12.4",
  "cuda_home": "/usr/local/cuda-12.4",
  "pytorch_cuda_version": "12.4",
  "profile": "standard",
  "defaults": {
    "data_factor": 1,
    "max_steps": 30000,
    "depth_model": "Base",
    "segmentation_enabled": true,
    "perceptual_pruning_enabled": true
  },
  "detected_at": "2026-03-31T10:00:00Z"
}
```

### Appendix D: Directory Structure

```
vr-scout-v4/
├── scripts/
│   ├── setup_environment.sh          # Hardware-adaptive installer
│   └── validate_colmap.py            # Pre-training validation
├── server/                           # FastAPI backend
│   ├── main.py
│   ├── pipeline/
│   │   ├── orchestrator.py           # Async pipeline runner
│   │   ├── steps/
│   │   │   ├── step_00_preflight.py
│   │   │   ├── step_01_upload_extract.py
│   │   │   ├── step_02_depth.py
│   │   │   ├── step_03_features.py
│   │   │   ├── step_04_matching.py
│   │   │   ├── step_05_mapping.py
│   │   │   ├── step_05_5_panorama_registration.py
│   │   │   ├── step_06_alignment.py
│   │   │   ├── step_07_validation.py
│   │   │   ├── step_08_segmentation.py
│   │   │   ├── step_09_training.py
│   │   │   ├── step_10_pruning.py
│   │   │   ├── step_11_mesh.py
│   │   │   ├── step_12_conversion.py
│   │   │   ├── step_13_video.py
│   │   │   ├── step_14_alignment_final.py
│   │   │   └── step_15_qa_review.py
│   │   └── hardware_profile.py
│   ├── metadata/
│   │   ├── extractor.py              # Universal metadata extractor
│   │   ├── dji_protobuf.py           # DJI PP-101 etc.
│   │   ├── camm.py                   # Google Camera Motion Metadata
│   │   ├── gpmf.py                   # GoPro Metadata Format
│   │   ├── apple_motion.py           # Apple CMMotion
│   │   ├── srt_parser.py             # DJI SRT sidecar
│   │   └── panorama_processor.py     # 360° equirectangular handling
│   ├── routes/
│   ├── ws/
│   └── db/
│       └── vr_scout.db
├── client/                           # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── UploadPanel.tsx
│   │   │   ├── PipelineMonitor.tsx
│   │   │   ├── ValidationReport.tsx
│   │   │   ├── CameraPathViewer.tsx
│   │   │   ├── FloorPlaneAdjuster.tsx
│   │   │   ├── ScenePreview.tsx
│   │   │   ├── StatusDashboard.tsx
│   │   │   ├── BoundingBoxCropEditor.tsx
│   │   │   ├── ScaleCalibrationTool.tsx
│   │   │   ├── DesktopQuestToggle.tsx
│   │   │   └── FlythroughVideoPlayer.tsx
│   │   ├── viewer/
│   │   │   └── SceneRenderer.tsx
│   │   └── App.tsx
│   └── vite.config.ts
├── tools/
│   └── gsplat/                       # Cloned gsplat repo
├── config/
│   └── hardware_profile.json         # Auto-generated by setup_environment.sh
├── scenes/
│   └── {scene_id}/
│       ├── frames/                   # Extracted JPEG frames
│       ├── depth/                    # Depth maps from Step 2
│       ├── masks/                    # Segmentation masks from Step 8
│       ├── metadata/                 # Extracted camera metadata
│       │   └── frame_metadata.json
│       ├── sparse/                   # COLMAP output
│       ├── aligned/                  # Post-alignment sparse
│       ├── gsplat_input/             # Symlinks for gsplat
│       ├── output/
│       │   ├── point_cloud.ply       # Raw training output
│       │   ├── point_cloud_pruned.ply # After perceptual pruning
│       │   ├── collision_mesh.glb    # From mesh extraction
│       │   ├── floor_plane.json      # Detected floor
│       │   ├── scene_desktop.spz     # Full-fidelity
│       │   ├── scene_quest.spz       # Quest-optimized
│       │   ├── flythrough.mp4        # Camera-path video
│       │   └── alignment.json        # Final alignment transform
│       ├── logs/
│       ├── validation_report.json
│       └── training_metrics.log
├── ENVIRONMENT.md                    # Auto-generated by setup_environment.sh
├── SETUP.md
├── requirements.txt
└── README.md
```

### Appendix E: WebSocket Message Schema

```typescript
type WSMessage =
  | { type: 'status'; data: StepStatus }
  | { type: 'metric'; data: TrainingMetric }
  | { type: 'log_line'; data: { step: number; line: string } }
  | { type: 'warning'; data: { message: string } }
  | { type: 'gpu'; data: { memory_used_mb: number; memory_total_mb: number; utilization_pct: number } }
  | { type: 'depth_progress'; data: { completed: number; total: number } }
  | { type: 'pruning_progress'; data: { current_count: number; target_count: number } }
  | { type: 'video_progress'; data: { frame: number; total_frames: number } }

interface TrainingMetric {
  iteration: number;
  max_iterations: number;
  loss: number;
  depth_loss?: number;
  psnr: number;
  gaussian_count: number;
  elapsed_seconds: number;
  eta_seconds: number;
}
```

---

*Document created: March 31, 2026*
*Project: VR Scout v4 | Stack: React 19, R3F, Three.js, gsplat, COLMAP, Spark, SPZ, Depth Anything, SAM 2*
*Architecture: Hardware-adaptive monolith with extractable viewer, generative AI enhancement layer*
*Key additions over v3: Universal metadata extraction, gravity/scale/leveling fix, depth priors, background segmentation, perceptual pruning, mesh extraction, two-tier export, flythrough video, 360° photo support, cross-machine portability*
