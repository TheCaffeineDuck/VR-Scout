"""Application configuration for VR Scout v4."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic_settings import BaseSettings

if TYPE_CHECKING:
    from server.models import HardwareProfile


def _find_project_root() -> Path:
    """Walk up from this file to find the directory containing pyproject.toml."""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / "pyproject.toml").exists():
            return current
        current = current.parent
    # Fallback: parent of server/
    return Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """VR Scout v4 configuration."""

    app_version: str = "4.0.0"
    db_path: str = "server/db/vr_scout.db"
    scenes_dir: str = "scenes"
    scripts_dir: str = "scripts"
    tools_dir: str = "tools"
    logs_dir: str = "logs"
    hardware_profile_path: str = "config/hardware_profile.json"
    host: str = "0.0.0.0"
    port: int = 8002
    cors_origins: list[str] = ["http://localhost:3000"]
    upload_chunk_size: int = 5 * 1024 * 1024  # 5 MB
    max_upload_size: int = 20 * 1024 * 1024 * 1024  # 20 GB
    ws_reconnect_interval_s: int = 5
    model_config = {"env_prefix": "VRS_"}

    @property
    def project_root(self) -> Path:
        """Return the project root directory."""
        return _find_project_root()

    @property
    def db_abs_path(self) -> Path:
        """Return the absolute database path."""
        return self.project_root / self.db_path

    @property
    def scenes_path(self) -> Path:
        """Return the scenes directory as an absolute Path."""
        return self.project_root / self.scenes_dir

    @property
    def tools_path(self) -> Path:
        """Return the tools directory as an absolute Path."""
        return self.project_root / self.tools_dir

    @property
    def gsplat_dir(self) -> Path:
        """Return the gsplat tools directory."""
        return self.tools_path / "gsplat"

    @property
    def scripts_path(self) -> Path:
        """Return the scripts directory as an absolute Path."""
        return self.project_root / self.scripts_dir

    @property
    def logs_path(self) -> Path:
        """Return the logs directory as an absolute Path."""
        return self.project_root / self.logs_dir

    @property
    def hardware_profile_abs_path(self) -> Path:
        """Return the absolute hardware profile path."""
        return self.project_root / self.hardware_profile_path

    def load_hardware_profile(self) -> HardwareProfile:
        """Read and return the hardware profile from disk."""
        from server.models import HardwareProfile

        path = self.hardware_profile_abs_path
        if not path.exists():
            return HardwareProfile()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return HardwareProfile(**data)
        except (json.JSONDecodeError, ValueError):
            return HardwareProfile()


settings = Settings()
