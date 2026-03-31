"""Database initialization and access for VR Scout v4."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import aiosqlite

from server.config import settings

_CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS scenes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id           TEXT PRIMARY KEY,
    scene_id     TEXT NOT NULL REFERENCES scenes(id),
    config_json  TEXT NOT NULL DEFAULT '{}',
    started_at   TEXT,
    completed_at TEXT,
    status       TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS step_statuses (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id    TEXT NOT NULL REFERENCES pipeline_runs(id),
    step_num  INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'pending',
    message   TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    pid       INTEGER
);
"""


async def init_db() -> None:
    """Create database tables if they do not exist."""
    db_path = settings.db_abs_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(db_path)) as db:
        await db.executescript(_CREATE_TABLES_SQL)
        await db.commit()


@asynccontextmanager
async def get_db() -> AsyncGenerator[aiosqlite.Connection]:
    """Yield an async database connection."""
    async with aiosqlite.connect(str(settings.db_abs_path)) as db:
        db.row_factory = aiosqlite.Row
        yield db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_scene(name: str, config_json: str = "{}") -> str:
    """Insert a new scene and return its ID."""
    scene_id = str(uuid.uuid4())
    async with get_db() as db:
        await db.execute(
            "INSERT INTO scenes (id, name, config_json, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (scene_id, name, config_json, _now_iso(), _now_iso()),
        )
        await db.commit()
    return scene_id


async def get_scene(scene_id: str) -> dict[str, object] | None:
    """Fetch a single scene by ID."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM scenes WHERE id = ?", (scene_id,))
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)


async def list_scenes() -> list[dict[str, object]]:
    """Return all scenes ordered by creation date descending."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM scenes ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def create_pipeline_run(scene_id: str, config_json: str) -> str:
    """Insert a new pipeline run and return its ID."""
    run_id = str(uuid.uuid4())
    async with get_db() as db:
        await db.execute(
            "INSERT INTO pipeline_runs (id, scene_id, config_json, started_at, status) "
            "VALUES (?, ?, ?, ?, ?)",
            (run_id, scene_id, config_json, _now_iso(), "running"),
        )
        await db.commit()
    return run_id


async def update_step_status(
    run_id: str,
    step_num: int,
    step_name: str,
    status: str,
    message: str = "",
    pid: int | None = None,
) -> None:
    """Insert a step status record for the given pipeline run."""
    async with get_db() as db:
        await db.execute(
            "INSERT INTO step_statuses "
            "(run_id, step_num, step_name, status, message, timestamp, pid) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (run_id, step_num, step_name, status, message, _now_iso(), pid),
        )
        await db.commit()


async def get_pipeline_status(scene_id: str) -> list[dict[str, object]]:
    """Return all step statuses for the latest pipeline run of a scene."""
    async with get_db() as db:
        # Find latest run
        cursor = await db.execute(
            "SELECT id FROM pipeline_runs WHERE scene_id = ? ORDER BY started_at DESC LIMIT 1",
            (scene_id,),
        )
        run_row = await cursor.fetchone()
        if run_row is None:
            return []
        run_id = run_row["id"]
        cursor = await db.execute(
            "SELECT * FROM step_statuses WHERE run_id = ? ORDER BY step_num, timestamp",
            (run_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_latest_run(scene_id: str) -> dict[str, object] | None:
    """Return the most recent pipeline run for a scene."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM pipeline_runs WHERE scene_id = ? ORDER BY started_at DESC LIMIT 1",
            (scene_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)


async def complete_pipeline_run(run_id: str, status: str) -> None:
    """Mark a pipeline run as completed with the given status."""
    async with get_db() as db:
        await db.execute(
            "UPDATE pipeline_runs SET completed_at = ?, status = ? WHERE id = ?",
            (_now_iso(), status, run_id),
        )
        await db.commit()
