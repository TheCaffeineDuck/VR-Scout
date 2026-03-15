"""SQLite database layer using aiosqlite."""

import json
from typing import Optional

import aiosqlite

from .config import settings
from .models.pipeline import PipelineConfig, PipelineRunRow, ValidationReport
from .models.scene import SceneConfig, SceneRow

SCHEMA = """
CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    config JSON,
    latest_run_id TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL REFERENCES scenes(id),
    config JSON NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    validation_report JSON,
    FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

CREATE TABLE IF NOT EXISTS pipeline_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    step_number INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    message TEXT,
    log_path TEXT,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
);
"""

# Shared connection for in-memory databases (used in tests)
_shared_connection: Optional[aiosqlite.Connection] = None


async def get_db() -> aiosqlite.Connection:
    """Get a database connection.

    For :memory: databases, returns a shared connection to ensure
    schema and data persist across calls.
    """
    global _shared_connection

    if settings.db_path == ":memory:":
        if _shared_connection is None:
            _shared_connection = await aiosqlite.connect(":memory:")
            _shared_connection.row_factory = aiosqlite.Row
            await _shared_connection.execute("PRAGMA foreign_keys=ON")
        return _shared_connection

    db = await aiosqlite.connect(settings.db_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def _close_if_not_shared(db: aiosqlite.Connection) -> None:
    """Close the connection unless it's the shared in-memory one."""
    if db is not _shared_connection:
        await db.close()


async def init_db() -> None:
    """Initialize database schema."""
    db = await get_db()
    try:
        await db.executescript(SCHEMA)
        await db.commit()
    finally:
        await _close_if_not_shared(db)


async def reset_db() -> None:
    """Reset the database (for tests). Drops and recreates all tables."""
    global _shared_connection
    if _shared_connection is not None:
        try:
            await _shared_connection.close()
        except Exception:
            pass
        _shared_connection = None
    await init_db()


# --- Scene CRUD ---


async def list_scenes() -> list[SceneRow]:
    """List all scenes."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, name, created_at, updated_at, config, latest_run_id "
            "FROM scenes ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        results: list[SceneRow] = []
        for row in rows:
            config_data = json.loads(row["config"]) if row["config"] else None
            results.append(
                SceneRow(
                    id=row["id"],
                    name=row["name"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    config=SceneConfig(**config_data) if config_data else None,
                    latest_run_id=row["latest_run_id"],
                )
            )
        return results
    finally:
        await _close_if_not_shared(db)


async def get_scene(scene_id: str) -> Optional[SceneRow]:
    """Get a scene by ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, name, created_at, updated_at, config, latest_run_id "
            "FROM scenes WHERE id = ?",
            (scene_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        config_data = json.loads(row["config"]) if row["config"] else None
        return SceneRow(
            id=row["id"],
            name=row["name"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            config=SceneConfig(**config_data) if config_data else None,
            latest_run_id=row["latest_run_id"],
        )
    finally:
        await _close_if_not_shared(db)


async def create_scene(scene_id: str, name: str) -> SceneRow:
    """Create a new scene."""
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO scenes (id, name) VALUES (?, ?)",
            (scene_id, name),
        )
        await db.commit()
    finally:
        await _close_if_not_shared(db)
    scene = await get_scene(scene_id)
    if scene is None:
        raise RuntimeError(f"Failed to create scene {scene_id}")
    return scene


async def update_scene_config(scene_id: str, config: SceneConfig) -> Optional[SceneRow]:
    """Update scene config."""
    db = await get_db()
    try:
        await db.execute(
            "UPDATE scenes SET config = ?, updated_at = datetime('now') WHERE id = ?",
            (config.model_dump_json(), scene_id),
        )
        await db.commit()
    finally:
        await _close_if_not_shared(db)
    return await get_scene(scene_id)


async def update_scene_latest_run(scene_id: str, run_id: str) -> None:
    """Update the latest run ID for a scene."""
    db = await get_db()
    try:
        await db.execute(
            "UPDATE scenes SET latest_run_id = ?, updated_at = datetime('now') WHERE id = ?",
            (run_id, scene_id),
        )
        await db.commit()
    finally:
        await _close_if_not_shared(db)


# --- Pipeline Run CRUD ---


async def create_run(
    run_id: str, scene_id: str, config: PipelineConfig
) -> PipelineRunRow:
    """Create a new pipeline run."""
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO pipeline_runs (id, scene_id, config, status, started_at) "
            "VALUES (?, ?, ?, 'running', datetime('now'))",
            (run_id, scene_id, config.model_dump_json()),
        )
        await db.commit()
    finally:
        await _close_if_not_shared(db)
    await update_scene_latest_run(scene_id, run_id)
    return PipelineRunRow(
        id=run_id,
        scene_id=scene_id,
        config=config,
        status="running",
    )


async def get_run(run_id: str) -> Optional[PipelineRunRow]:
    """Get a pipeline run by ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, scene_id, config, status, started_at, completed_at, "
            "validation_report FROM pipeline_runs WHERE id = ?",
            (run_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        config_data = json.loads(row["config"])
        vr_data = json.loads(row["validation_report"]) if row["validation_report"] else None
        return PipelineRunRow(
            id=row["id"],
            scene_id=row["scene_id"],
            config=PipelineConfig(**config_data),
            status=row["status"],
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            validation_report=ValidationReport(**vr_data) if vr_data else None,
        )
    finally:
        await _close_if_not_shared(db)


async def get_latest_run(scene_id: str) -> Optional[PipelineRunRow]:
    """Get the latest pipeline run for a scene."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, scene_id, config, status, started_at, completed_at, "
            "validation_report FROM pipeline_runs "
            "WHERE scene_id = ? ORDER BY started_at DESC LIMIT 1",
            (scene_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        config_data = json.loads(row["config"])
        vr_data = json.loads(row["validation_report"]) if row["validation_report"] else None
        return PipelineRunRow(
            id=row["id"],
            scene_id=row["scene_id"],
            config=PipelineConfig(**config_data),
            status=row["status"],
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            validation_report=ValidationReport(**vr_data) if vr_data else None,
        )
    finally:
        await _close_if_not_shared(db)


async def update_run_status(
    run_id: str,
    status: str,
    validation_report: Optional[ValidationReport] = None,
) -> None:
    """Update pipeline run status."""
    db = await get_db()
    try:
        if validation_report is not None:
            vr_json = json.dumps(validation_report.model_dump())
            await db.execute(
                "UPDATE pipeline_runs SET status = ?, completed_at = datetime('now'), "
                "validation_report = ? WHERE id = ?",
                (status, vr_json, run_id),
            )
        else:
            await db.execute(
                "UPDATE pipeline_runs SET status = ? WHERE id = ?",
                (status, run_id),
            )
        await db.commit()
    finally:
        await _close_if_not_shared(db)


# --- Pipeline Step CRUD ---


async def create_step(
    run_id: str, step_number: int, step_name: str
) -> None:
    """Create a pipeline step record."""
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO pipeline_steps (run_id, step_number, step_name) "
            "VALUES (?, ?, ?)",
            (run_id, step_number, step_name),
        )
        await db.commit()
    finally:
        await _close_if_not_shared(db)


async def update_step(
    run_id: str,
    step_number: int,
    status: str,
    message: Optional[str] = None,
    log_path: Optional[str] = None,
) -> None:
    """Update a pipeline step."""
    db = await get_db()
    try:
        fields = ["status = ?"]
        params: list[object] = [status]

        if status == "running":
            fields.append("started_at = datetime('now')")
        elif status in ("completed", "failed"):
            fields.append("completed_at = datetime('now')")

        if message is not None:
            fields.append("message = ?")
            params.append(message)
        if log_path is not None:
            fields.append("log_path = ?")
            params.append(log_path)

        params.extend([run_id, step_number])
        await db.execute(
            f"UPDATE pipeline_steps SET {', '.join(fields)} "  # noqa: S608
            "WHERE run_id = ? AND step_number = ?",
            params,
        )
        await db.commit()
    finally:
        await _close_if_not_shared(db)
