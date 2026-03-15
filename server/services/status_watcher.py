"""Status file watcher service.

Polls status.json for changes and pushes WSMessage on change.
This is a stub — full implementation will use filesystem polling or inotify.
"""

import json
import logging
from pathlib import Path
from typing import Optional

from ..config import settings
from ..models.pipeline import StatusFile

logger = logging.getLogger(__name__)


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


# TODO: Implement polling loop that watches status.json and broadcasts
# changes via the WebSocket manager. Will be activated when pipeline
# runs are triggered.
