"""Training metrics log parser.

Parses training_metrics.log produced during gsplat training.
This is a stub — full implementation will tail the log file during training.
"""

import logging
from pathlib import Path
from typing import Optional

from ..config import settings
from ..models.ws import TrainingMetric

logger = logging.getLogger(__name__)


def parse_metrics_file(scene_id: str) -> list[TrainingMetric]:
    """Parse all training metrics from the log file.

    Returns an empty list if the file does not exist.
    """
    metrics_path = Path(settings.scenes_dir) / scene_id / "training_metrics.log"
    if not metrics_path.exists():
        return []

    metrics: list[TrainingMetric] = []
    for line in metrics_path.read_text(encoding="utf-8").strip().splitlines():
        parsed = _parse_line(line)
        if parsed is not None:
            metrics.append(parsed)
    return metrics


def _parse_line(line: str) -> Optional[TrainingMetric]:
    """Parse a single metrics log line.

    Expected format (tab-separated):
    iteration\tmax_iterations\tloss\tpsnr\tgaussian_count\telapsed_seconds\teta_seconds
    """
    parts = line.strip().split("\t")
    if len(parts) != 7:
        return None
    try:
        return TrainingMetric(
            iteration=int(parts[0]),
            max_iterations=int(parts[1]),
            loss=float(parts[2]),
            psnr=float(parts[3]),
            gaussian_count=int(parts[4]),
            elapsed_seconds=float(parts[5]),
            eta_seconds=float(parts[6]),
        )
    except (ValueError, IndexError):
        return None


# TODO: Implement live tailing during training step, pushing
# TrainingMetric messages via WebSocket manager.
