"""Application configuration for VR Scout v4."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """VR Scout v4 configuration."""

    app_version: str = "4.0.0"
    db_path: str = "vr_scout.db"
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
    model_config = {"env_prefix": "VRS_"}

    @property
    def scenes_path(self) -> Path:
        """Return the scenes directory as a Path."""
        return Path(self.scenes_dir)

    @property
    def tools_path(self) -> Path:
        """Return the tools directory as a Path."""
        return Path(self.tools_dir)


settings = Settings()
