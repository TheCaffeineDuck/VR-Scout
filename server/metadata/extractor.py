"""Universal metadata extraction facade for VR Scout v4."""

from __future__ import annotations

import logging
from pathlib import Path

from server.models import FrameMetadata, MetadataResult

logger = logging.getLogger(__name__)


class UniversalMetadataExtractor:
    """Try multiple extraction strategies and return the best result."""

    async def run_cascade(self, video_path: Path) -> MetadataResult:
        """Attempt each extractor in priority order and return merged data."""
        frames: list[FrameMetadata] = []
        source = ""
        device = ""

        # Priority 1: DJI protobuf (Osmo Pocket 3, Action cameras)
        try:
            from server.metadata.dji_protobuf import extract_dji_protobuf

            frames = await extract_dji_protobuf(video_path)
            if frames:
                source = "dji_protobuf"
                device = "DJI"
                logger.info("DJI protobuf extraction succeeded: %d frames", len(frames))
        except Exception:
            logger.debug("DJI protobuf extraction failed", exc_info=True)

        # Priority 2: CAMM (Android Camera Motion Metadata)
        if not frames:
            try:
                from server.metadata.camm import extract_camm

                frames = await extract_camm(video_path)
                if frames:
                    source = "camm"
                    device = "Android"
                    logger.info("CAMM extraction succeeded: %d frames", len(frames))
            except Exception:
                logger.debug("CAMM extraction failed", exc_info=True)

        # Priority 3: GPMF (GoPro Metadata Format)
        if not frames:
            try:
                from server.metadata.gpmf import extract_gpmf

                frames = await extract_gpmf(video_path)
                if frames:
                    source = "gpmf"
                    device = "GoPro"
                    logger.info("GPMF extraction succeeded: %d frames", len(frames))
            except Exception:
                logger.debug("GPMF extraction failed", exc_info=True)

        # Priority 4: Apple CoreMotion
        if not frames:
            try:
                from server.metadata.apple_motion import extract_apple_motion

                frames = await extract_apple_motion(video_path)
                if frames:
                    source = "apple_motion"
                    device = "Apple"
                    logger.info("Apple motion extraction succeeded: %d frames", len(frames))
            except Exception:
                logger.debug("Apple motion extraction failed", exc_info=True)

        # Priority 5: EXIF orientation
        if not frames:
            try:
                from server.metadata.exif_orientation import extract_exif_orientation

                frames = await extract_exif_orientation(video_path)
                if frames:
                    source = "exif"
                    device = "unknown"
                    logger.info("EXIF extraction succeeded: %d frames", len(frames))
            except Exception:
                logger.debug("EXIF extraction failed", exc_info=True)

        if not frames:
            logger.info("No metadata extracted from %s", video_path.name)
            return MetadataResult(source="none", device="unknown")

        # Derive boolean flags
        has_gravity = any(f.gravity_vector is not None for f in frames)
        has_gps = any(f.gps is not None for f in frames)
        has_orientation = any(f.quaternion is not None for f in frames)
        has_metric_scale = has_gps  # GPS provides real-world scale

        return MetadataResult(
            source=source,
            device=device,
            frames=frames,
            has_gravity=has_gravity,
            has_gps=has_gps,
            has_orientation=has_orientation,
            has_metric_scale=has_metric_scale,
        )

    def normalize(self, raw_data: dict[str, object]) -> MetadataResult:
        """Convert raw extraction output into a canonical MetadataResult."""
        return MetadataResult.model_validate(raw_data)
