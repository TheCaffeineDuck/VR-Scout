"""Step 5.5: Panorama registration -- register equirectangular images."""

from __future__ import annotations

from pathlib import Path

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class PanoramaRegistrationStep(StepBase):
    """Split panoramas into cube faces and register them into the SfM model."""

    step_num: int = 55  # logical 5.5, stored as int
    step_name: str = "panorama_registration"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Split equirectangular panoramas and register cube-map faces."""
        scene_dir = self.get_scene_dir(scene_id)
        pano_dir = scene_dir / "panoramas"

        # Check if panoramas exist — if not, skip
        if not pano_dir.exists() or not any(pano_dir.iterdir()):
            return StepResult(
                exit_code=0,
                message="No panoramas to process — skipping.",
                duration_seconds=self.elapsed_time,
            )

        # Collect panorama files
        pano_files = [
            f for f in sorted(pano_dir.iterdir())
            if f.suffix.lower() in (".jpg", ".jpeg", ".png")
        ]

        if not pano_files:
            return StepResult(
                exit_code=0,
                message="No panorama image files found — skipping.",
                duration_seconds=self.elapsed_time,
            )

        await self.write_log(scene_id, f"Processing {len(pano_files)} panoramas")

        # Split each panorama into cubemap faces
        from server.metadata.panorama_processor import split_equirectangular

        faces_dir = scene_dir / "panorama_faces"
        faces_dir.mkdir(parents=True, exist_ok=True)
        all_faces: list[Path] = []

        for pano_path in pano_files:
            await self.write_log(scene_id, f"Splitting: {pano_path.name}")
            faces = await split_equirectangular(pano_path, faces_dir)
            all_faces.extend(faces)
            await self.write_log(scene_id, f"  Generated {len(faces)} cubemap faces")

        if not all_faces:
            return StepResult(
                exit_code=1,
                message="Panorama splitting produced no faces. Skipping registration.",
                duration_seconds=self.elapsed_time,
            )

        # Copy faces to frames directory for inclusion in training
        frames_dir = scene_dir / "frames"
        for face in all_faces:
            dest = frames_dir / face.name
            if not dest.exists():
                import shutil
                shutil.copy2(face, dest)

        # Run COLMAP image_registrator to register faces into existing model
        sparse_dir = scene_dir / "sparse"
        db_path = sparse_dir / "database.db"
        input_model = _find_best_model(sparse_dir)

        if input_model is None or not db_path.exists():
            return StepResult(
                exit_code=1,
                message="No COLMAP model found for panorama registration.",
                duration_seconds=self.elapsed_time,
            )

        updated_model = sparse_dir / "registered"
        updated_model.mkdir(parents=True, exist_ok=True)

        cmd: list[str] = [
            "colmap", "image_registrator",
            "--database_path", str(db_path),
            "--input_path", str(input_model),
            "--output_path", str(updated_model),
        ]

        result = await self.run_subprocess(scene_id, cmd, timeout=900.0)

        registered_count = len(all_faces)
        msg = f"Panorama registration complete. {registered_count} cubemap faces processed."
        return StepResult(
            exit_code=result.exit_code,
            message=msg if result.exit_code == 0 else result.message,
            duration_seconds=self.elapsed_time,
        )


def _find_best_model(sparse_dir: Path) -> Path | None:
    """Find the best COLMAP sparse model directory."""
    model_0 = sparse_dir / "0"
    if model_0.exists() and (model_0 / "cameras.bin").exists():
        return model_0

    # Try numbered subdirectories
    for subdir in sorted(sparse_dir.iterdir()):
        if subdir.is_dir() and (subdir / "cameras.bin").exists():
            return subdir

    return None
