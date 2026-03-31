"""Step 1: Upload and extract -- ingest video and extract frames."""

from __future__ import annotations

import json
from pathlib import Path

from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class UploadExtractStep(StepBase):
    """Receive uploaded video, detect scene changes, and extract frames."""

    step_num: int = 1
    step_name: str = "upload_extract"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Extract frames from video using ffmpeg with scene-change detection."""
        scene_dir = self.get_scene_dir(scene_id)
        raw_dir = scene_dir / "raw"
        frames_dir = scene_dir / "frames"
        metadata_dir = scene_dir / "metadata"

        # Find the video file
        video_path = self._find_video(raw_dir)
        if video_path is None:
            return StepResult(
                exit_code=2,
                message=f"No video file found in {raw_dir}",
                duration_seconds=self.elapsed_time,
            )

        await self.write_log(scene_id, f"Video: {video_path.name}")

        # Create output directories
        frames_dir.mkdir(parents=True, exist_ok=True)
        metadata_dir.mkdir(parents=True, exist_ok=True)

        # Build ffmpeg command
        # CRITICAL: scene_change_threshold defaults to 0.02 (NOT 0.1)
        output_pattern = str(frames_dir / "frame_%05d.jpg")
        threshold = config.scene_change_threshold

        if threshold == 0.0:
            vf = f"fps={config.frame_fps}"
        else:
            vf = f"fps={config.frame_fps},select='gt(scene\\,{threshold})'"

        cmd = [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vf", vf,
            "-vsync", "vfr",
            "-q:v", "2",
            output_pattern,
        ]

        result = await self.run_subprocess(scene_id, cmd)
        if result.exit_code != 0:
            return result

        # Count extracted frames
        frame_files = sorted(frames_dir.glob("frame_*.jpg"))
        frame_count = len(frame_files)
        await self.write_log(scene_id, f"Extracted {frame_count} frames")

        # Run metadata extraction
        try:
            from server.metadata.extractor import UniversalMetadataExtractor

            extractor = UniversalMetadataExtractor()
            metadata_result = await extractor.run_cascade(video_path)
            metadata_path = metadata_dir / "frame_metadata.json"
            metadata_path.write_text(
                metadata_result.model_dump_json(indent=2), encoding="utf-8",
            )
            await self.write_log(
                scene_id,
                f"Metadata: source={metadata_result.source}, "
                f"device={metadata_result.device}, "
                f"frames={len(metadata_result.frames)}, "
                f"has_gravity={metadata_result.has_gravity}, "
                f"has_gps={metadata_result.has_gps}",
            )
        except Exception as exc:
            await self.write_log(scene_id, f"Metadata extraction failed: {exc}")

        # Parse SRT if available
        supp_dir = scene_dir / "supplementary"
        if supp_dir.exists():
            srt_files = list(supp_dir.glob("*.srt")) + list(supp_dir.glob("*.SRT"))
            for srt_file in srt_files:
                try:
                    from server.metadata.srt_parser import parse_srt

                    srt_data = parse_srt(srt_file)
                    srt_out = metadata_dir / f"{srt_file.stem}_srt.json"
                    srt_out.write_text(
                        json.dumps([fm.model_dump() for fm in srt_data], indent=2, default=str),
                        encoding="utf-8",
                    )
                    await self.write_log(
                        scene_id, f"Parsed SRT: {srt_file.name} ({len(srt_data)} entries)",
                    )
                except Exception as exc:
                    await self.write_log(scene_id, f"SRT parse failed for {srt_file.name}: {exc}")

        # Frame count gates
        if frame_count < 50:
            return StepResult(
                exit_code=2,
                message=f"Only {frame_count} frames extracted (minimum 50 required). "
                "Try lowering scene_change_threshold or increasing fps.",
                duration_seconds=self.elapsed_time,
            )

        if frame_count < 150:
            return StepResult(
                exit_code=1,
                message=f"{frame_count} frames extracted (150+ recommended for best results)",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(
            exit_code=0,
            message=f"{frame_count} frames extracted successfully",
            duration_seconds=self.elapsed_time,
        )

    @staticmethod
    def _find_video(raw_dir: Path) -> Path | None:
        """Find a single video file in the raw directory."""
        if not raw_dir.exists():
            return None
        video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
        for f in raw_dir.iterdir():
            if f.suffix.lower() in video_exts and f.is_file():
                return f
        return None
