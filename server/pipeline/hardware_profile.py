"""Hardware detection and profile loading for VR Scout v4."""

from __future__ import annotations

from pathlib import Path

from server.models import HardwareProfile


def load_profile(path: Path) -> HardwareProfile:
    """Load a previously-saved hardware profile from disk."""
    return HardwareProfile()


async def detect_profile() -> HardwareProfile:
    """Detect GPU, CUDA, and PyTorch capabilities and return a profile."""
    return HardwareProfile()
