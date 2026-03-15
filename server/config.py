"""Application configuration via pydantic-settings."""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    app_version: str = "0.1.0"
    db_path: str = "vr_scout.db"
    scenes_dir: str = "scenes"
    raw_dir: str = "raw"
    scripts_dir: str = "scripts"
    cors_origins: list[str] = ["http://localhost:3000"]
    upload_chunk_size: int = 5 * 1024 * 1024  # 5 MB
    max_upload_size: int = 10 * 1024 * 1024 * 1024  # 10 GB
    max_total_upload_size: int = 20 * 1024 * 1024 * 1024  # 20 GB per scene
    max_chunk_size: int = 10 * 1024 * 1024  # 10 MB hard limit per chunk

    model_config = {"env_prefix": "VRS_"}

    @property
    def scenes_path(self) -> Path:
        return Path(self.scenes_dir)

    @property
    def raw_path(self) -> Path:
        return Path(self.raw_dir)

    @property
    def scripts_path(self) -> Path:
        return Path(self.scripts_dir)

    @property
    def db_file(self) -> Path:
        return Path(self.db_path)


settings = Settings()
