"""Tests for scene CRUD endpoints."""

from typing import Any

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_scenes_empty(client: AsyncClient) -> None:
    """GET /api/scenes returns empty list initially."""
    response = await client.get("/api/scenes")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_scene(client: AsyncClient, sample_scene: dict[str, Any]) -> None:
    """POST /api/scenes creates a scene and returns it."""
    response = await client.post("/api/scenes", json=sample_scene)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == sample_scene["id"]
    assert data["name"] == sample_scene["name"]
    assert data["config"] is None
    assert data["latest_run_id"] is None


@pytest.mark.asyncio
async def test_create_duplicate_scene(client: AsyncClient, sample_scene: dict[str, Any]) -> None:
    """POST /api/scenes with duplicate ID returns 409."""
    await client.post("/api/scenes", json=sample_scene)
    response = await client.post("/api/scenes", json=sample_scene)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_list_scenes_after_create(client: AsyncClient, sample_scene: dict[str, Any]) -> None:
    """GET /api/scenes returns created scene."""
    await client.post("/api/scenes", json=sample_scene)
    response = await client.get("/api/scenes")
    assert response.status_code == 200
    scenes = response.json()
    assert len(scenes) == 1
    assert scenes[0]["id"] == sample_scene["id"]


@pytest.mark.asyncio
async def test_get_scene_config_not_found(client: AsyncClient) -> None:
    """GET /api/scene/{id}/config returns 404 for missing scene."""
    response = await client.get("/api/scene/nonexistent/config")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_scene_config_no_config(client: AsyncClient, sample_scene: dict[str, Any]) -> None:
    """GET /api/scene/{id}/config returns 404 when scene has no config."""
    await client.post("/api/scenes", json=sample_scene)
    response = await client.get(f"/api/scene/{sample_scene['id']}/config")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_path_traversal_rejected(client: AsyncClient) -> None:
    """Scene IDs with path traversal patterns are rejected via create."""
    # Path traversal in scene creation is caught by validation
    response = await client.post("/api/scenes", json={"id": "..evil", "name": "Bad"})
    assert response.status_code == 400

    response = await client.post("/api/scenes", json={"id": "foo/bar", "name": "Bad"})
    assert response.status_code == 400

    response = await client.post("/api/scenes", json={"id": "foo\\bar", "name": "Bad"})
    assert response.status_code == 400
