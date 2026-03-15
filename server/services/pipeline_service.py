"""Pipeline orchestration service.

Starts process.sh via asyncio.create_subprocess_exec (NEVER shell).
Tracks PIDs per scene_id. Implements cancel (SIGTERM -> SIGKILL) and resume.
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


def _get_process_sh_path(scene_id: str) -> str:
    """Get the path to process.sh for a scene."""
    return str(settings.scenes_path / scene_id / "process.sh")


async def start_pipeline(
    scene_id: str, config: PipelineConfig, resume_from: Optional[int] = None
) -> str:
    """Start the pipeline for a scene.

    Returns the run_id.
    """
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
    process_sh = _get_process_sh_path(scene_id)
    cmd_args = [
        process_sh,
        "--scene-id", scene_id,
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
        raise RuntimeError(f"process.sh not found for scene {scene_id}")

    return run_id


async def _monitor_process(
    scene_id: str, run_id: str, process: asyncio.subprocess.Process
) -> None:
    """Monitor a running pipeline process."""
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
    return True


def is_running(scene_id: str) -> bool:
    """Check if a pipeline is currently running for a scene."""
    process = _running_processes.get(scene_id)
    return process is not None and process.returncode is None
