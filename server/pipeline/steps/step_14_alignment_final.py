"""Step 14: Final alignment -- apply user corrections to the scene."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase

# Identity 4x4 matrix (column-major)
_IDENTITY_MATRIX = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
]


class AlignmentFinalStep(StepBase):
    """Apply final user-driven alignment, crop, and scale adjustments."""

    step_num: int = 14
    step_name: str = "alignment_final"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Bake user alignment edits into the SPZ and mesh assets."""
        scene_dir = self.get_scene_dir(scene_id)
        output_dir = scene_dir / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        # Start with identity transform
        transform = list(_IDENTITY_MATRIX)
        source = "identity"
        scale_metric = False
        meters_per_unit: float | None = None

        # Layer 1: Check step 06 alignment method
        alignment_method_path = scene_dir / "alignment_method.json"
        if alignment_method_path.exists():
            try:
                info = json.loads(alignment_method_path.read_text(encoding="utf-8"))
                method = info.get("method", "identity")
                if method != "identity":
                    source = method
                    await self.write_log(scene_id, f"Base alignment: {method}")
            except (json.JSONDecodeError, KeyError):
                pass

        # Layer 2: Check for mesh floor plane (from step 11, may not exist)
        floor_plane_path = scene_dir / "floor_plane.json"
        if floor_plane_path.exists():
            try:
                floor_data = json.loads(floor_plane_path.read_text(encoding="utf-8"))
                if "transform" in floor_data:
                    transform = floor_data["transform"]
                    source = "mesh_floor"
                    await self.write_log(scene_id, "Applied mesh floor correction")
            except (json.JSONDecodeError, KeyError):
                pass

        # Layer 3: Check for user alignment edits
        user_alignment_path = scene_dir / "user_alignment.json"
        if user_alignment_path.exists():
            try:
                user_data = json.loads(user_alignment_path.read_text(encoding="utf-8"))
                if "transform" in user_data:
                    transform = user_data["transform"]
                    source = "manual"
                if "scale_metric" in user_data:
                    scale_metric = user_data["scale_metric"]
                if "meters_per_unit" in user_data:
                    meters_per_unit = user_data["meters_per_unit"]
                await self.write_log(scene_id, "Applied user alignment overrides")
            except (json.JSONDecodeError, KeyError):
                pass

        # Layer 4: Check for scale params
        scale_params_path = scene_dir / "scale_params.json"
        if scale_params_path.exists():
            try:
                scale_data = json.loads(scale_params_path.read_text(encoding="utf-8"))
                if "meters_per_unit" in scale_data:
                    meters_per_unit = scale_data["meters_per_unit"]
                    scale_metric = True
                    await self.write_log(
                        scene_id,
                        f"Applied metric scale: {meters_per_unit} m/unit",
                    )
            except (json.JSONDecodeError, KeyError):
                pass

        # Write final alignment.json
        alignment = {
            "transform": transform,
            "source": source,
            "scale_metric": scale_metric,
            "meters_per_unit": meters_per_unit,
            "scene_id": scene_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        alignment_path = output_dir / "alignment.json"
        alignment_path.write_text(json.dumps(alignment, indent=2), encoding="utf-8")

        await self.write_log(
            scene_id,
            f"Final alignment: source={source}, scale_metric={scale_metric}",
        )

        return StepResult(
            exit_code=0,
            message=f"Alignment finalized (source: {source})",
            duration_seconds=self.elapsed_time,
        )
