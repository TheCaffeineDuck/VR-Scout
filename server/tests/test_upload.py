"""Tests for the chunked upload endpoint."""

from typing import Any

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_upload_chunk_scene_not_found(client: AsyncClient) -> None:
    """POST /api/upload/chunk returns 404 for missing scene."""
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": "nonexistent",
            "chunk_index": 0,
            "total_chunks": 1,
        },
        files={"file": ("chunk", b"test data")},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_upload_chunk_invalid_index(client: AsyncClient, sample_scene: dict[str, Any]) -> None:
    """POST /api/upload/chunk rejects invalid chunk_index."""
    await client.post("/api/scenes", json=sample_scene)
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": sample_scene["id"],
            "chunk_index": -1,
            "total_chunks": 1,
        },
        files={"file": ("chunk", b"test data")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_upload_single_chunk(client: AsyncClient, sample_scene: dict[str, Any]) -> None:
    """POST /api/upload/chunk with single chunk reassembles file."""
    await client.post("/api/scenes", json=sample_scene)
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": sample_scene["id"],
            "chunk_index": 0,
            "total_chunks": 1,
        },
        files={"file": ("chunk", b"video data here")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["total_chunks"] == 1


@pytest.mark.asyncio
async def test_upload_multi_chunk(client: AsyncClient, sample_scene: dict[str, Any]) -> None:
    """POST /api/upload/chunk with multiple chunks reassembles correctly."""
    await client.post("/api/scenes", json=sample_scene)

    # Send first chunk
    r1 = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": sample_scene["id"],
            "chunk_index": 0,
            "total_chunks": 2,
        },
        files={"file": ("chunk", b"part1")},
    )
    assert r1.status_code == 200
    assert r1.json()["status"] == "partial"

    # Send second chunk
    r2 = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": sample_scene["id"],
            "chunk_index": 1,
            "total_chunks": 2,
        },
        files={"file": ("chunk", b"part2")},
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "complete"


@pytest.mark.asyncio
async def test_upload_path_traversal_rejected(client: AsyncClient) -> None:
    """Upload with path traversal scene_id is rejected."""
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": "../evil",
            "chunk_index": 0,
            "total_chunks": 1,
        },
        files={"file": ("chunk", b"test data")},
    )
    assert response.status_code == 400
