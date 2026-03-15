"""Pipeline orchestration service.

Starts process.sh via asyncio.create_subprocess_exec (NEVER shell).
Tracks PIDs per scene_id. Implements cancel (SIGTERM -> SIGKILL) and resume.
Includes hang detection per-step with warn/kill thresholds.
"""

import asyncio
import logging
import signal
import sys
from datetime import datetime, timezone
from typing import Optional

from ..config import settings
from ..db import create_run, create_step, update_run_status, update_step
from ..models.pipeline import PipelineConfig
from ..ws.manager import manager

logger = logging.getLogger(__name__)

# Track running processes by scene_id
_running_processes: dict[str, asyncio.subprocess.Process] = {}

# Track hang detection tasks by scene_id
_hang_detection_tasks: dict[str, asyncio.Task[None]] = {}

# Track current step start time and step number per scene_id
_step_tracking: dict[str, tuple[float, int]] = {}

# Pipeline step definitions
PIPELINE_STEPS = [
    (1, "extract_frames"),
    (2, "colmap_feature_extract"),
    (3, "colmap_matching"),
    (4, "colmap_mapper"),
    (5, "validate_colmap"),
    (6, "alignment"),
    (7, "training"),
    (8, "export_spz"),
]

# Hang detection thresholds (seconds) per step index (0-based).
# Format: (warn_seconds, kill_seconds)
# Step 0 is preflight (not in PIPELINE_STEPS but tracked separately).
HANG_THRESHOLDS: dict[int, tuple[float, float]] = {
    0: (15, 50),           # preflight
    1: (360, 1200),        # frame extraction: warn 6min, kill 20min
    2: (1800, 6000),       # feature extraction: warn 30min, kill 100min
    3: (5400, 18000),      # matching exhaustive: warn 90min, kill 300min
    4: (10800, 36000),     # mapping: warn 180min, kill 600min
    5: (90, 300),          # gravity alignment: warn 90s, kill 300s
    6: (30, 100),          # validation: warn 30s, kill 100s
    7: (21600, 43200),     # training 30K: warn 360min, kill 720min
    8: (900, 3000),        # conversion: warn 15min, kill 50min
}

HANG_CHECK_INTERVAL_SECONDS = 5.0


def _get_process_sh_path() -> str:
    """Get the path to scripts/process.sh."""
    return str(settings.scripts_path / "process.sh")


def update_step_tracking(scene_id: str, step_number: int) -> None:
    """Update the current step being tracked for hang detection.

    Called externally (e.g. by status_watcher) when step transitions are detected.
    """
    import time
    _step_tracking[scene_id] = (time.monotonic(), step_number)


async def _hang_detection_loop(scene_id: str) -> None:
    """Background task that checks elapsed time per step against thresholds."""
    import time

    logger.info("Hang detection started for scene %s", scene_id)
    warned_steps: set[int] = set()

    try:
        while True:
            await asyncio.sleep(HANG_CHECK_INTERVAL_SECONDS)

            tracking = _step_tracking.get(scene_id)
            if tracking is None:
                continue

            start_time, step_number = tracking
            elapsed = time.monotonic() - start_time
            thresholds = HANG_THRESHOLDS.get(step_number)
            if thresholds is None:
                continue

            warn_threshold, kill_threshold = thresholds

            if elapsed > kill_threshold:
                step_name = (
                    PIPELINE_STEPS[step_number - 1][1]
                    if 1 <= step_number <= len(PIPELINE_STEPS)
                    else f"step_{step_number}"
                )
                logger.error(
                    "Hang kill threshold exceeded for scene %s step %d (%s): "
                    "%.0fs > %.0fs",
                    scene_id, step_number, step_name, elapsed, kill_threshold,
                )
                await manager.broadcast(scene_id, {
                    "type": "warning",
                    "data": {
                        "message": (
                            f"Step {step_number} ({step_name}) exceeded kill threshold "
                            f"({elapsed:.0f}s > {kill_threshold:.0f}s). "
                            f"Cancelling pipeline."
                        ),
                    },
                })
                # Kill the pipeline
                await cancel_pipeline(scene_id)
                return

            if elapsed > warn_threshold and step_number not in warned_steps:
                step_name = (
                    PIPELINE_STEPS[step_number - 1][1]
                    if 1 <= step_number <= len(PIPELINE_STEPS)
                    else f"step_{step_number}"
                )
                warned_steps.add(step_number)
                logger.warning(
                    "Hang warning for scene %s step %d (%s): %.0fs > %.0fs",
                    scene_id, step_number, step_name, elapsed, warn_threshold,
                )
                await manager.broadcast(scene_id, {
                    "type": "warning",
                    "data": {
                        "message": (
                            f"Step {step_number} ({step_name}) is taking longer than "
                            f"expected ({elapsed:.0f}s > {warn_threshold:.0f}s)"
                        ),
                    },
                })

    except asyncio.CancelledError:
        logger.info("Hang detection stopped for scene %s", scene_id)
    finally:
        _step_tracking.pop(scene_id, None)


def _start_hang_detection(scene_id: str, initial_step: int) -> None:
    """Start hang detection for a scene."""
    import time

    _step_tracking[scene_id] = (time.monotonic(), initial_step)
    task = asyncio.create_task(_hang_detection_loop(scene_id))
    _hang_detection_tasks[scene_id] = task


def _stop_hang_detection(scene_id: str) -> None:
    """Stop hang detection for a scene."""
    task = _hang_detection_tasks.pop(scene_id, None)
    if task is not None and not task.done():
        task.cancel()
    _step_tracking.pop(scene_id, None)


async def start_pipeline(
    scene_id: str, config: PipelineConfig, resume_from: Optional[int] = None
) -> str:
    """Start the pipeline for a scene.

    Returns the run_id.
    """
    # Import here to avoid circular imports at module level
    from .metrics_parser import start_tailing
    from .status_watcher import start_watching

    if scene_id in _running_processes:
        proc = _running_processes[scene_id]
        if proc.returncode is None:
            raise RuntimeError(f"Pipeline already running for scene {scene_id}")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    await create_run(run_id, scene_id, config)

    # Create step records
    for step_number, step_name in PIPELINE_STEPS:
        await create_step(run_id, step_number, step_name)

    # Build command args — NEVER use shell=True
    process_sh = _get_process_sh_path()
    cmd_args = [
        process_sh,
        scene_id,  # positional arg expected by process.sh
        "--camera-model", config.camera_model,
        "--matcher", config.matcher,
        "--iterations", str(config.training_iterations),
        "--sh-degree", str(config.sh_degree),
        "--data-factor", str(config.data_factor),
        "--frame-fps", str(config.frame_fps),
    ]

    if resume_from is not None:
        cmd_args.extend(["--resume-from", str(resume_from)])

    try:
        # Use create_subprocess_exec — NEVER create_subprocess_shell
        process = await asyncio.create_subprocess_exec(
            "bash", *cmd_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(settings.scenes_path / scene_id),
        )
        _running_processes[scene_id] = process

        await update_step(run_id, resume_from or 1, "running")

        # Start background services
        start_watching(scene_id)
        start_tailing(scene_id)
        initial_step = resume_from or 1
        _start_hang_detection(scene_id, initial_step)

        # Notify via WebSocket
        await manager.broadcast(scene_id, {
            "type": "status",
            "data": {
                "scene_id": scene_id,
                "current_step": resume_from or 1,
                "step_name": PIPELINE_STEPS[(resume_from or 1) - 1][1],
                "status": "running",
                "message": f"Pipeline started (run {run_id})",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "pid": process.pid or 0,
            },
        })

        # Monitor process in background
        asyncio.create_task(_monitor_process(scene_id, run_id, process))

    except FileNotFoundError:
        await update_run_status(run_id, "failed")
        raise RuntimeError(f"process.sh not found at {process_sh}")

    return run_id


async def _monitor_process(
    scene_id: str, run_id: str, process: asyncio.subprocess.Process
) -> None:
    """Monitor a running pipeline process."""
    # Import here to avoid circular imports at module level
    from .metrics_parser import stop_tailing
    from .status_watcher import stop_watching

    try:
        await process.wait()
        status = "completed" if process.returncode == 0 else "failed"
        await update_run_status(run_id, status)

        await manager.broadcast(scene_id, {
            "type": "status",
            "data": {
                "scene_id": scene_id,
                "current_step": len(PIPELINE_STEPS),
                "step_name": PIPELINE_STEPS[-1][1],
                "status": status,
                "message": f"Pipeline {status} (exit code {process.returncode})",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "pid": process.pid or 0,
            },
        })
    except Exception:
        logger.exception("Error monitoring pipeline for scene %s", scene_id)
    finally:
        _running_processes.pop(scene_id, None)
        # Stop background services
        stop_watching(scene_id)
        stop_tailing(scene_id)
        _stop_hang_detection(scene_id)


async def cancel_pipeline(scene_id: str) -> bool:
    """Cancel a running pipeline. Sends SIGTERM, waits 10s, then SIGKILL.

    Returns True if a process was cancelled, False if none was running.
    """
    process = _running_processes.get(scene_id)
    if process is None or process.returncode is not None:
        return False

    pid = process.pid
    logger.info("Cancelling pipeline for scene %s (PID %s)", scene_id, pid)

    try:
        if sys.platform == "win32":
            process.kill()
        else:
            process.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(process.wait(), timeout=10.0)
            except TimeoutError:
                logger.warning("SIGTERM timeout for PID %s, sending SIGKILL", pid)
                process.kill()
                await process.wait()
    except ProcessLookupError:
        pass

    _running_processes.pop(scene_id, None)
    _stop_hang_detection(scene_id)
    return True


def is_running(scene_id: str) -> bool:
    """Check if a pipeline is currently running for a scene."""
    process = _running_processes.get(scene_id)
    return process is not None and process.returncode is None
