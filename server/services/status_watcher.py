"""Status file watcher service.

Polls status.json for changes and pushes WSMessage on change.
Background asyncio task per scene_id, started/stopped with the pipeline.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from ..config import settings
from ..models.pipeline import StatusFile
from ..ws.manager import manager

logger = logging.getLogger(__name__)

# Track active watcher tasks by scene_id
_watcher_tasks: dict[str, asyncio.Task[None]] = {}

# Store last seen status per scene_id for diffing
_last_seen: dict[str, dict[str, object]] = {}

POLL_INTERVAL_SECONDS = 1.0


def read_status_file(scene_id: str) -> Optional[StatusFile]:
    """Read and parse status.json for a scene.

    Returns None if the file does not exist or is invalid.
    """
    status_path = Path(settings.scenes_dir) / scene_id / "status.json"
    if not status_path.exists():
        return None

    try:
        data = json.loads(status_path.read_text(encoding="utf-8"))
        return StatusFile(**data)
    except (json.JSONDecodeError, KeyError, ValueError):
        logger.warning("Invalid status.json for scene %s", scene_id)
        return None


async def _poll_loop(scene_id: str) -> None:
    """Background polling loop that watches status.json and broadcasts changes."""
    logger.info("Status watcher started for scene %s", scene_id)
    status_path = Path(settings.scenes_dir) / scene_id / "status.json"

    try:
        while True:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

            if not status_path.exists():
                continue

            try:
                raw = status_path.read_text(encoding="utf-8")
                data = json.loads(raw)
            except (json.JSONDecodeError, OSError):
                continue

            # Diff against last seen state
            previous = _last_seen.get(scene_id)
            if previous == data:
                continue

            # State changed — update and broadcast
            _last_seen[scene_id] = data

            try:
                status = StatusFile(**data)
                await manager.broadcast(scene_id, {
                    "type": "status",
                    "data": status.model_dump(),
                })
                logger.debug(
                    "Status change for scene %s: step=%d status=%s",
                    scene_id, status.current_step, status.status,
                )

                # Update hang detection timer on step transitions
                previous_step = previous.get("current_step") if previous else None
                if status.current_step != previous_step:
                    from ..services.pipeline_service import update_step_tracking
                    update_step_tracking(scene_id, status.current_step)

            except (KeyError, ValueError):
                logger.warning("Invalid status.json content for scene %s", scene_id)

    except asyncio.CancelledError:
        logger.info("Status watcher stopped for scene %s", scene_id)
    finally:
        _last_seen.pop(scene_id, None)


def start_watching(scene_id: str) -> None:
    """Start watching status.json for a scene. Idempotent."""
    if scene_id in _watcher_tasks:
        task = _watcher_tasks[scene_id]
        if not task.done():
            return

    _watcher_tasks[scene_id] = asyncio.create_task(_poll_loop(scene_id))


def stop_watching(scene_id: str) -> None:
    """Stop watching status.json for a scene. Idempotent."""
    task = _watcher_tasks.pop(scene_id, None)
    if task is not None and not task.done():
        task.cancel()
    _last_seen.pop(scene_id, None)


def is_watching(scene_id: str) -> bool:
    """Check if a watcher is active for a scene."""
    task = _watcher_tasks.get(scene_id)
    return task is not None and not task.done()
