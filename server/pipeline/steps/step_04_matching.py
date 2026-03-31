"""Step 4: Feature matching -- match keypoints across frame pairs."""

from __future__ import annotations

import json

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class MatchingStep(StepBase):
    """Match features between image pairs using the configured matcher."""

    step_num: int = 4
    step_name: str = "matching"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run COLMAP exhaustive, sequential, or spatial matching."""
        scene_dir = self.get_scene_dir(scene_id)
        db_path = scene_dir / "colmap.db"

        if not db_path.exists():
            return StepResult(
                exit_code=2,
                message="COLMAP database not found — run feature extraction first",
                duration_seconds=self.elapsed_time,
            )

        # Determine matcher type — override to spatial if GPS available
        matcher_type = config.matcher

        metadata_path = scene_dir / "metadata" / "frame_metadata.json"
        if metadata_path.exists():
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                if metadata.get("has_gps", False):
                    matcher_type = "spatial"
                    await self.write_log(scene_id, "GPS data detected — using spatial matcher")
            except (json.JSONDecodeError, KeyError):
                pass

        await self.write_log(scene_id, f"Using {matcher_type} matcher")

        cmd = [
            "colmap", f"{matcher_type}_matcher",
            "--database_path", str(db_path),
        ]

        # Generous timeout for exhaustive matching
        timeout = 7200.0 if matcher_type == "exhaustive" else 3600.0

        result = await self.run_subprocess(scene_id, cmd, timeout=timeout)
        if result.exit_code != 0:
            return result

        return StepResult(
            exit_code=0,
            message=f"Feature matching completed ({matcher_type})",
            duration_seconds=self.elapsed_time,
        )
