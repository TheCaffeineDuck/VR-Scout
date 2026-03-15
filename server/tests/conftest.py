"""Shared test fixtures."""

import os
import shutil
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Use in-memory DB for tests
os.environ["VRS_DB_PATH"] = ":memory:"
os.environ["VRS_SCENES_DIR"] = "test_scenes"

from server.db import reset_db  # noqa: E402
from server.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Create an async HTTP test client with fresh DB."""
    await reset_db()

    # Clean test scenes directory
    if os.path.exists("test_scenes"):
        shutil.rmtree("test_scenes")
    os.makedirs("test_scenes", exist_ok=True)

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    # Cleanup
    if os.path.exists("test_scenes"):
        shutil.rmtree("test_scenes")


@pytest.fixture
def sample_scene() -> dict[str, Any]:
    """Sample scene creation payload."""
    return {"id": "test_scene_01", "name": "Test Scene"}


@pytest.fixture
def sample_pipeline_config() -> dict[str, Any]:
    """Sample pipeline config payload."""
    return {
        "camera_model": "SIMPLE_RADIAL",
        "matcher": "exhaustive",
        "training_iterations": 30000,
        "sh_degree": 1,
        "data_factor": 1,
        "frame_fps": 2,
        "scene_change_threshold": 0.1,
    }
