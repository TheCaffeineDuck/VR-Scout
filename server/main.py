"""FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routes import health, pipeline, scenes, upload
from .security import validate_scene_id
from .services.gpu_poller import start_gpu_poller, stop_gpu_poller
from .ws.manager import manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: initialize DB on startup."""
    logger.info("Initializing database at %s", settings.db_path)
    await init_db()
    logger.info("Database initialized")
    start_gpu_poller()
    logger.info("GPU poller started")
    yield
    stop_gpu_poller()
    logger.info("Shutting down")


app = FastAPI(
    title="VR Scout v3",
    version=settings.app_version,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health.router)
app.include_router(scenes.router)
app.include_router(pipeline.router)
app.include_router(upload.router)


# WebSocket endpoint
@app.websocket("/api/ws/{scene_id}")
async def websocket_endpoint(websocket: WebSocket, scene_id: str) -> None:
    """WebSocket endpoint for real-time pipeline updates."""
    validate_scene_id(scene_id)
    await manager.connect(scene_id, websocket)
    try:
        while True:
            # Keep connection alive, listen for client messages
            data = await websocket.receive_text()
            # Client messages are currently ignored (server-push only)
            logger.debug("WS message from client for scene %s: %s", scene_id, data)
    except WebSocketDisconnect:
        manager.disconnect(scene_id, websocket)
    except Exception:
        logger.exception("Unexpected WebSocket error for scene %s", scene_id)
        manager.disconnect(scene_id, websocket)
