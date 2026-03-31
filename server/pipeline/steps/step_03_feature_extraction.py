"""Step 3: Feature extraction -- detect keypoints and descriptors."""

from __future__ import annotations

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class FeatureExtractionStep(StepBase):
    """Extract SIFT or learned features from each frame for SfM matching."""

    step_num: int = 3
    step_name: str = "feature_extraction"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run COLMAP feature extraction on the image set."""
        scene_dir = self.get_scene_dir(scene_id)
        frames_dir = scene_dir / "frames"
        sparse_dir = scene_dir / "sparse"
        sparse_dir.mkdir(parents=True, exist_ok=True)

        db_path = scene_dir / "colmap.db"

        if not frames_dir.exists() or not any(frames_dir.iterdir()):
            return StepResult(
                exit_code=2,
                message=f"No frames found in {frames_dir}",
                duration_seconds=self.elapsed_time,
            )

        db_size_before = db_path.stat().st_size if db_path.exists() else 0

        cmd = [
            "colmap", "feature_extractor",
            "--ImageReader.camera_model", config.camera_model,
            "--ImageReader.single_camera", "1",
            "--database_path", str(db_path),
            "--image_path", str(frames_dir),
        ]

        result = await self.run_subprocess(scene_id, cmd)
        if result.exit_code != 0:
            return result

        # Verify features were extracted
        if not db_path.exists():
            return StepResult(
                exit_code=2,
                message="COLMAP database not created after feature extraction",
                duration_seconds=self.elapsed_time,
            )

        db_size_after = db_path.stat().st_size
        if db_size_after <= db_size_before:
            return StepResult(
                exit_code=2,
                message="COLMAP database did not grow — feature extraction may have failed",
                duration_seconds=self.elapsed_time,
            )

        await self.write_log(
            scene_id,
            f"Feature extraction complete. DB size: {db_size_after / 1024:.0f} KB",
        )

        return StepResult(
            exit_code=0,
            message="Feature extraction completed",
            duration_seconds=self.elapsed_time,
        )
