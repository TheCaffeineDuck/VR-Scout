#!/bin/bash
# process.sh — Full pipeline orchestration for VR Scout v3
# Usage: ./process.sh <SCENE_ID> [--resume-from N]
#
# Steps:
#   0: Pre-flight checks
#   1: Frame extraction (ffmpeg)
#   2: COLMAP feature extraction
#   3: COLMAP matching
#   4: COLMAP mapping
#   5: Gravity alignment
#   6: Validation checkpoint
#   7: gsplat MCMC training
#   8: 3dgsconverter PLY→SPZ
#   9: Generate default alignment.json

set -uo pipefail
# NOTE: -e is NOT set — we capture exit codes per step instead

# ─── Argument Parsing ─────────────────────────────────────────────
if [ $# -lt 1 ]; then
  echo "Usage: $0 <SCENE_ID> [--resume-from N]"
  exit 1
fi

SCENE_ID="$1"
RESUME_FROM=0

# CLI overrides (set by pipeline_service.py, fallback to config file below)
CLI_CAMERA_MODEL=""
CLI_MATCHER=""
CLI_ITERATIONS=""
CLI_SH_DEGREE=""
CLI_DATA_FACTOR=""
CLI_FRAME_FPS=""

shift
while [ $# -gt 0 ]; do
  case "$1" in
    --resume-from)
      RESUME_FROM="$2"
      shift 2
      ;;
    --camera-model)
      CLI_CAMERA_MODEL="$2"
      shift 2
      ;;
    --matcher)
      CLI_MATCHER="$2"
      shift 2
      ;;
    --iterations)
      CLI_ITERATIONS="$2"
      shift 2
      ;;
    --sh-degree)
      CLI_SH_DEGREE="$2"
      shift 2
      ;;
    --data-factor)
      CLI_DATA_FACTOR="$2"
      shift 2
      ;;
    --frame-fps)
      CLI_FRAME_FPS="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# ─── Paths ────────────────────────────────────────────────────────
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

# Path to gsplat repo clone (need examples/simple_trainer.py)
GSPLAT_DIR="$PROJECT_ROOT/tools/gsplat"

# Read pipeline defaults from config
CONFIG_FILE="$PROJECT_ROOT/config/pipeline_defaults.json"
if [ -f "$CONFIG_FILE" ]; then
  CAMERA_MODEL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['camera_model'])")
  MATCHER=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['matcher'])")
  TRAINING_ITERATIONS=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['training_iterations'])")
  SH_DEGREE=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['sh_degree'])")
  DATA_FACTOR=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['data_factor'])")
  FRAME_FPS=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['frame_fps'])")
  SCENE_CHANGE_THRESHOLD=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['scene_change_threshold'])")
  MIN_OPACITY=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['min_opacity'])")
  SOR_INTENSITY=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['sor_intensity'])")
  COMPRESSION_LEVEL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['compression_level'])")
else
  echo "WARNING: Config file not found at $CONFIG_FILE, using defaults"
  CAMERA_MODEL="SIMPLE_RADIAL"
  MATCHER="exhaustive"
  TRAINING_ITERATIONS=30000
  SH_DEGREE=1
  DATA_FACTOR=1
  FRAME_FPS=2
  SCENE_CHANGE_THRESHOLD=0.1
  MIN_OPACITY=5
  SOR_INTENSITY=3
  COMPRESSION_LEVEL=5
fi

# Apply CLI overrides (from pipeline_service.py) over config file defaults
[ -n "$CLI_CAMERA_MODEL" ] && CAMERA_MODEL="$CLI_CAMERA_MODEL"
[ -n "$CLI_MATCHER" ] && MATCHER="$CLI_MATCHER"
[ -n "$CLI_ITERATIONS" ] && TRAINING_ITERATIONS="$CLI_ITERATIONS"
[ -n "$CLI_SH_DEGREE" ] && SH_DEGREE="$CLI_SH_DEGREE"
[ -n "$CLI_DATA_FACTOR" ] && DATA_FACTOR="$CLI_DATA_FACTOR"
[ -n "$CLI_FRAME_FPS" ] && FRAME_FPS="$CLI_FRAME_FPS"

mkdir -p "$FRAMES_DIR" "$SPARSE_DIR" "$ALIGNED_DIR" "$OUTPUT_DIR" "$LOGS_DIR"

# ─── Status Reporting ─────────────────────────────────────────────
write_status() {
  local step_num="$1"
  local step_name="$2"
  local status="$3"
  local message="${4:-}"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat > "$STATUS_FILE" <<STATUSEOF
{
  "scene_id": "$SCENE_ID",
  "current_step": $step_num,
  "step_name": "$step_name",
  "status": "$status",
  "message": "$message",
  "timestamp": "$timestamp",
  "pid": $$
}
STATUSEOF
}

run_step() {
  local step_num="$1"
  local step_name="$2"
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

# ─── Step 0: Pre-flight Checks ───────────────────────────────────
if [ "$RESUME_FROM" -le 0 ]; then
  write_status 0 "preflight" "running"

  PREFLIGHT_ERRORS=""

  if [ ! -f "$RAW_VIDEO" ]; then
    PREFLIGHT_ERRORS+="Video file not found: $RAW_VIDEO\n"
  fi

  if [ -z "${CUDA_HOME:-}" ]; then
    PREFLIGHT_ERRORS+="CUDA_HOME is not set. Run: export CUDA_HOME=/usr/local/cuda\n"
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
fi

# ─── Step 1: Frame Extraction ────────────────────────────────────
if [ "$RESUME_FROM" -le 1 ]; then
  run_step 1 "frame_extraction" \
    ffmpeg -i "$RAW_VIDEO" \
      -vf "fps=$FRAME_FPS,select='gt(scene\,$SCENE_CHANGE_THRESHOLD)'" \
      -vsync vfr -q:v 2 \
      "$FRAMES_DIR/frame_%05d.jpg"

  # Validation gate: frame count
  FRAME_COUNT=$(find "$FRAMES_DIR" -name '*.jpg' -type f | wc -l)
  echo "Extracted $FRAME_COUNT frames."

  if [ "$FRAME_COUNT" -lt 50 ]; then
    write_status 1 "frame_extraction" "failed" \
      "Only $FRAME_COUNT frames extracted. Minimum 50 required. Check video file or reduce scene-change threshold."
    exit 1
  elif [ "$FRAME_COUNT" -lt 150 ]; then
    write_status 1 "frame_extraction" "warning" \
      "$FRAME_COUNT frames extracted. 150+ recommended for good COLMAP registration. Consider re-shooting with slower movement."
  fi
fi

# ─── Step 2: COLMAP Feature Extraction ───────────────────────────
if [ "$RESUME_FROM" -le 2 ]; then
  run_step 2 "feature_extraction" \
    colmap feature_extractor \
      --ImageReader.camera_model "$CAMERA_MODEL" \
      --ImageReader.single_camera 1 \
      --database_path "$DB_PATH" \
      --image_path "$FRAMES_DIR"
fi

# ─── Step 3: Matching ────────────────────────────────────────────
if [ "$RESUME_FROM" -le 3 ]; then
  run_step 3 "matching" \
    colmap "${MATCHER}_matcher" \
      --database_path "$DB_PATH"
fi

# ─── Step 4: Mapping ─────────────────────────────────────────────
if [ "$RESUME_FROM" -le 4 ]; then
  run_step 4 "mapping" \
    colmap mapper \
      --database_path "$DB_PATH" \
      --image_path "$FRAMES_DIR" \
      --output_path "$SPARSE_DIR"

  # Validation gate: select best model if multiple exist
  BEST_MODEL=""
  BEST_COUNT=0
  for MODEL_DIR in "$SPARSE_DIR"/*/; do
    if [ -f "${MODEL_DIR}images.bin" ]; then
      IMG_SIZE=$(stat -c%s "${MODEL_DIR}images.bin" 2>/dev/null || echo "0")
      if [ "$IMG_SIZE" -gt "$BEST_COUNT" ]; then
        BEST_COUNT="$IMG_SIZE"
        BEST_MODEL="$MODEL_DIR"
      fi
    fi
  done

  if [ -z "$BEST_MODEL" ]; then
    write_status 4 "mapping" "failed" "No COLMAP models produced. Check frame quality and overlap."
    exit 1
  fi

  MODEL_COUNT=$(find "$SPARSE_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
  if [ "$MODEL_COUNT" -gt 1 ]; then
    write_status 4 "mapping" "warning" \
      "COLMAP split scene into $MODEL_COUNT models. Using largest: $BEST_MODEL. Scene may have disconnected regions."
  fi

  echo "Using COLMAP model: $BEST_MODEL"

  # Check registration rate via validate_colmap.py
  FRAME_COUNT=$(find "$FRAMES_DIR" -name '*.jpg' -type f | wc -l)
  REG_REPORT=$(python3 "$PROJECT_ROOT/scripts/validate_colmap.py" \
    --sparse_path "$BEST_MODEL" \
    --image_path "$FRAMES_DIR" \
    --output_json /dev/null \
    --min_registration_rate 0.5 2>&1) || true
  REG_RATE=$(echo "$REG_REPORT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('registration_rate',0))" 2>/dev/null || echo "0")

  # Save BEST_MODEL path for subsequent steps
  echo "$BEST_MODEL" > "$SCENE_DIR/.best_model_path"
fi

# Restore BEST_MODEL from saved path if resuming past step 4
if [ "$RESUME_FROM" -gt 4 ] && [ -f "$SCENE_DIR/.best_model_path" ]; then
  BEST_MODEL=$(cat "$SCENE_DIR/.best_model_path")
elif [ -z "${BEST_MODEL:-}" ]; then
  # Fallback: pick sparse/0 if it exists
  BEST_MODEL="$SPARSE_DIR/0/"
fi

# ─── Step 5: Gravity Alignment ───────────────────────────────────
if [ "$RESUME_FROM" -le 5 ]; then
  run_step 5 "gravity_alignment" \
    colmap model_orientation_aligner \
      --image_path "$FRAMES_DIR" \
      --input_path "$BEST_MODEL" \
      --output_path "$ALIGNED_DIR"
fi

# ─── Step 6: Validation ──────────────────────────────────────────
if [ "$RESUME_FROM" -le 6 ]; then
  run_step 6 "validation" \
    python3 "$PROJECT_ROOT/scripts/validate_colmap.py" \
      --sparse_path "$ALIGNED_DIR" \
      --original_sparse_path "$BEST_MODEL" \
      --image_path "$FRAMES_DIR" \
      --output_json "$SCENE_DIR/validation_report.json" \
      --min_registration_rate 0.9

  VALIDATION_EXIT=$?
  if [ "$VALIDATION_EXIT" -eq 2 ]; then
    write_status 6 "validation" "blocked" \
      "Registration rate below 50%. Re-shoot recommended. See validation_report.json."
    exit 1
  fi

  # Pipeline pauses here — user must confirm via UI before training
  write_status 6 "validation" "awaiting_confirmation" \
    "Validation complete. Review report and confirm to proceed."

  echo "Pipeline paused. Awaiting user confirmation to proceed to training."
  echo "Validation report: $SCENE_DIR/validation_report.json"
  echo "To continue: $0 $SCENE_ID --resume-from 7"
  exit 0
fi

# ─── Step 7: gsplat Training ─────────────────────────────────────
if [ "$RESUME_FROM" -le 7 ]; then
  # Set up data directory structure that gsplat expects
  # gsplat simple_trainer expects: data_dir/images/ and data_dir/sparse/0/
  GSPLAT_DATA_DIR="$SCENE_DIR/gsplat_input"
  mkdir -p "$GSPLAT_DATA_DIR/sparse/0"
  ln -sfn "$FRAMES_DIR" "$GSPLAT_DATA_DIR/images"
  ln -sfn "$ALIGNED_DIR/cameras.bin" "$GSPLAT_DATA_DIR/sparse/0/cameras.bin"
  ln -sfn "$ALIGNED_DIR/images.bin" "$GSPLAT_DATA_DIR/sparse/0/images.bin"
  ln -sfn "$ALIGNED_DIR/points3D.bin" "$GSPLAT_DATA_DIR/sparse/0/points3D.bin"

  write_status 7 "training" "running" "Starting gsplat MCMC training ($TRAINING_ITERATIONS iterations)"

  TRAIN_LOG="$LOGS_DIR/step_7_training.log"
  echo "=== Step 7: training ===" > "$TRAIN_LOG"

  # Training with stdout capture for live metrics
  (cd "$GSPLAT_DIR" && python3 examples/simple_trainer.py mcmc \
    --data_dir "$GSPLAT_DATA_DIR" \
    --result_dir "$OUTPUT_DIR" \
    --use_bilateral_grid \
    --max_steps "$TRAINING_ITERATIONS" \
    --sh_degree "$SH_DEGREE" \
    --data_factor "$DATA_FACTOR" \
    2>&1) | tee -a "$TRAIN_LOG" | \
    grep --line-buffered -i "step\|psnr\|loss\|num_gaussians" > "$SCENE_DIR/training_metrics.log" &

  TRAIN_PID=$!
  wait $TRAIN_PID
  TRAIN_EXIT=$?

  if [ $TRAIN_EXIT -ne 0 ]; then
    # Check for common failure patterns
    if grep -qi "CUDA out of memory" "$TRAIN_LOG"; then
      write_status 7 "training" "failed" \
        "CUDA out of memory. Try: re-run with data_factor=2 to halve resolution."
    elif grep -qi "nan" "$TRAIN_LOG"; then
      write_status 7 "training" "failed" \
        "Training diverged (NaN loss). Try: reduce learning rate by 0.1x."
    else
      write_status 7 "training" "failed" "Training failed with exit code $TRAIN_EXIT. Check step_7_training.log."
    fi
    exit $TRAIN_EXIT
  fi

  write_status 7 "training" "completed" "Training finished. Output: $OUTPUT_DIR/point_cloud.ply"
fi

# ─── Step 8: Cleanup + SPZ Conversion ────────────────────────────
if [ "$RESUME_FROM" -le 8 ]; then
  run_step 8 "conversion" \
    3dgsconverter \
      -i "$OUTPUT_DIR/point_cloud.ply" \
      -o "$OUTPUT_DIR/scene.spz" \
      --min_opacity "$MIN_OPACITY" \
      --sor_intensity "$SOR_INTENSITY" \
      --compression_level "$COMPRESSION_LEVEL"

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
fi

# ─── Step 9: Generate default alignment.json ─────────────────────
if [ "$RESUME_FROM" -le 9 ]; then
  # Since model_orientation_aligner ran pre-training, the default alignment
  # is identity. The UI will allow manual adjustment and overwrite this file.
  cat > "$OUTPUT_DIR/alignment.json" <<ALIGNEOF
{
  "transform": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  "source": "identity (pre-training alignment applied)",
  "scene_id": "$SCENE_ID",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
ALIGNEOF

  write_status 9 "alignment" "awaiting_review" \
    "Pipeline complete. Open QA review to verify alignment and visual quality."

  echo ""
  echo "========================================"
  echo "  Pipeline complete for: $SCENE_ID"
  echo "  SPZ: $OUTPUT_DIR/scene.spz (${SPZ_SIZE_MB:-?}MB)"
  echo "  Alignment: $OUTPUT_DIR/alignment.json"
  echo "  Logs: $LOGS_DIR/"
  echo "  Open the UI to review scene quality."
  echo "========================================"
fi
