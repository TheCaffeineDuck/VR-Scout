"""FastAPI application entry point for VR Scout v4."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from server.config import settings
from server.database import init_db
from server.routes import pipeline, scenes, upload
from server.routes import settings as settings_routes
from server.ws.handler import ConnectionManager

manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Run startup and shutdown logic for the application."""
    await init_db()
    yield


app = FastAPI(
    title="VR Scout v4",
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(pipeline.router)
app.include_router(scenes.router)
app.include_router(settings_routes.router)


@app.websocket("/api/ws/{scene_id}")
async def websocket_endpoint(websocket: WebSocket, scene_id: str) -> None:
    """Handle a WebSocket connection for real-time scene updates."""
    await manager.connect(scene_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(scene_id, websocket)
