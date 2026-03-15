"""GPU stats polling service.

Periodically runs nvidia-smi to collect GPU memory and utilization stats,
broadcasting them via WebSocket to all connected clients.
"""

import asyncio
import logging
from typing import Optional

from ..ws.manager import manager

logger = logging.getLogger(__name__)

GPU_POLL_INTERVAL_SECONDS = 30.0

_poller_task: Optional[asyncio.Task[None]] = None


async def _query_gpu_stats() -> Optional[dict[str, float]]:
    """Run nvidia-smi and parse GPU stats.

    Uses asyncio.create_subprocess_exec (NEVER shell=True).
    Returns None if nvidia-smi is not available or fails.
    """
    try:
        process = await asyncio.create_subprocess_exec(
            "nvidia-smi",
            "--query-gpu=memory.used,memory.total,utilization.gpu",
            "--format=csv,noheader,nounits",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=10.0
        )
    except FileNotFoundError:
        logger.debug("nvidia-smi not found, GPU polling unavailable")
        return None
    except TimeoutError:
        logger.warning("nvidia-smi timed out")
        return None

    if process.returncode != 0:
        logger.debug(
            "nvidia-smi exited with code %d: %s",
            process.returncode,
            stderr.decode(errors="replace").strip(),
        )
        return None

    output = stdout.decode(errors="replace").strip()
    if not output:
        return None

    # Parse first GPU line (multi-GPU: take first)
    first_line = output.splitlines()[0]
    parts = [p.strip() for p in first_line.split(",")]
    if len(parts) != 3:
        logger.warning("Unexpected nvidia-smi output: %s", first_line)
        return None

    try:
        return {
            "memory_used_mb": float(parts[0]),
            "memory_total_mb": float(parts[1]),
            "utilization_pct": float(parts[2]),
        }
    except ValueError:
        logger.warning("Failed to parse nvidia-smi values: %s", parts)
        return None


async def _poll_loop() -> None:
    """Background task that polls GPU stats and broadcasts to all scenes."""
    logger.info("GPU poller started (interval: %ds)", GPU_POLL_INTERVAL_SECONDS)

    try:
        while True:
            await asyncio.sleep(GPU_POLL_INTERVAL_SECONDS)

            stats = await _query_gpu_stats()
            if stats is None:
                continue

            # Broadcast to all scenes with active connections
            for scene_id in manager.get_all_scenes():
                await manager.broadcast(scene_id, {
                    "type": "gpu",
                    "data": stats,
                })

    except asyncio.CancelledError:
        logger.info("GPU poller stopped")


def start_gpu_poller() -> None:
    """Start the GPU polling background task. Idempotent."""
    global _poller_task
    if _poller_task is not None and not _poller_task.done():
        return
    _poller_task = asyncio.create_task(_poll_loop())


def stop_gpu_poller() -> None:
    """Stop the GPU polling background task. Idempotent."""
    global _poller_task
    if _poller_task is not None and not _poller_task.done():
        _poller_task.cancel()
    _poller_task = None


def is_polling() -> bool:
    """Check if the GPU poller is active."""
    return _poller_task is not None and not _poller_task.done()
