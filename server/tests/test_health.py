"""Tests for the health endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient) -> None:
    """GET /api/health returns status ok and version."""
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
