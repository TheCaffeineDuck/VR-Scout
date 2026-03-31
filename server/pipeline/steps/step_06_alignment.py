"""Step 6: Alignment -- orient the reconstruction to real-world axes."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class AlignmentStep(StepBase):
    """Align the SfM reconstruction using gravity and GPS priors."""

    step_num: int = 6
    step_name: str = "alignment"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Apply gravity alignment and optional geo-registration."""
        scene_dir = self.get_scene_dir(scene_id)
        frames_dir = scene_dir / "frames"
        aligned_dir = scene_dir / "aligned"
        aligned_dir.mkdir(parents=True, exist_ok=True)

        # Determine best model path
        best_model_file = scene_dir / "best_model.txt"
        if best_model_file.exists():
            model_path = best_model_file.read_text(encoding="utf-8").strip()
        else:
            # Fallback: first sparse model
            sparse_dir = scene_dir / "sparse"
            model_dirs = sorted(d for d in sparse_dir.iterdir() if d.is_dir())
            if not model_dirs:
                return StepResult(
                    exit_code=2,
                    message="No sparse model found — run mapping first",
                    duration_seconds=self.elapsed_time,
                )
            model_path = str(model_dirs[0])

        # Check metadata for gravity priors
        metadata_path = scene_dir / "metadata" / "frame_metadata.json"
        has_gravity = False
        if metadata_path.exists():
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                has_gravity = metadata.get("has_gravity", False)
            except (json.JSONDecodeError, KeyError):
                pass

        alignment_method = "identity"
        needs_mesh_fallback = False

        if has_gravity:
            # Model should already be gravity-aligned from priors injected in step 3
            await self.write_log(scene_id, "Gravity priors detected — model assumed pre-aligned")
            alignment_method = "gravity_prior"
            # Copy model to aligned/
            self._copy_model(model_path, aligned_dir)
        else:
            # Run COLMAP model_orientation_aligner (Manhattan world assumption)
            await self.write_log(scene_id, "No gravity priors — running Manhattan alignment")

            cmd = [
                "colmap", "model_orientation_aligner",
                "--image_path", str(frames_dir),
                "--input_path", model_path,
                "--output_path", str(aligned_dir),
            ]

            result = await self.run_subprocess(scene_id, cmd)

            if result.exit_code != 0:
                # Alignment failed — copy model as-is
                await self.write_log(
                    scene_id, "model_orientation_aligner failed — copying unaligned model",
                )
                self._copy_model(model_path, aligned_dir)
                alignment_method = "identity"
                needs_mesh_fallback = True
            else:
                # Check if the output differs from input (non-identity transform)
                input_images = (model_path if isinstance(model_path, str) else str(model_path))
                input_size = sum(
                    f.stat().st_size for f in self._model_files(input_images)
                )
                output_size = sum(
                    f.stat().st_size for f in self._model_files(str(aligned_dir))
                )

                if abs(input_size - output_size) < 100:
                    # Files are essentially identical — alignment likely failed
                    await self.write_log(
                        scene_id,
                        "Manhattan alignment produced identity transform — "
                        "will attempt mesh-based alignment after training",
                    )
                    alignment_method = "identity"
                    needs_mesh_fallback = True
                else:
                    alignment_method = "manhattan"

        # Write alignment method info
        alignment_info = {
            "method": alignment_method,
            "needs_mesh_fallback": needs_mesh_fallback,
        }
        (scene_dir / "alignment_method.json").write_text(
            json.dumps(alignment_info, indent=2), encoding="utf-8",
        )

        await self.write_log(scene_id, f"Alignment method: {alignment_method}")

        if needs_mesh_fallback:
            return StepResult(
                exit_code=1,
                message=f"Alignment method: {alignment_method} "
                "(mesh-based fallback will be attempted after training)",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(
            exit_code=0,
            message=f"Alignment completed via {alignment_method}",
            duration_seconds=self.elapsed_time,
        )

    @staticmethod
    def _copy_model(src_path: str, dst_dir: Path) -> None:
        """Copy COLMAP model files from src to dst."""
        src = Path(src_path)
        for ext in ["cameras.bin", "images.bin", "points3D.bin",
                     "cameras.txt", "images.txt", "points3D.txt"]:
            src_file = src / ext
            if src_file.exists():
                shutil.copy2(src_file, dst_dir / ext)

    @staticmethod
    def _model_files(path: str) -> list[Path]:
        """Return list of model files in a directory."""
        d = Path(path)
        files = []
        for name in ["cameras.bin", "images.bin", "points3D.bin"]:
            f = d / name
            if f.exists():
                files.append(f)
        return files
