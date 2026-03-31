"""Database initialization and access for VR Scout v4."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

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
    async with aiosqlite.connect(settings.db_path) as db:
        await db.executescript(_CREATE_TABLES_SQL)
        await db.commit()


@asynccontextmanager
async def get_db() -> AsyncGenerator[aiosqlite.Connection]:
    """Yield an async database connection."""
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db
