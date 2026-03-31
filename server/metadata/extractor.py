"""Universal metadata extraction facade for VR Scout v4."""

from __future__ import annotations

from pathlib import Path

from server.models import MetadataResult


class UniversalMetadataExtractor:
    """Try multiple extraction strategies and return the best result."""

    async def run_cascade(self, video_path: Path) -> MetadataResult:
        """Attempt each extractor in priority order and return merged data."""
        return MetadataResult()

    def normalize(self, raw_data: dict[str, object]) -> MetadataResult:
        """Convert raw extraction output into a canonical MetadataResult."""
        return MetadataResult()
