"""WebSocket connection manager for real-time pipeline updates."""

from __future__ import annotations

import json
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manage per-scene WebSocket connections and broadcast messages."""

    def __init__(self) -> None:
        """Initialize the connection store."""
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, scene_id: str, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection for a scene."""
        await websocket.accept()
        if scene_id not in self._connections:
            self._connections[scene_id] = []
        self._connections[scene_id].append(websocket)
        # Send current pipeline status on connect
        await self._send_current_status(scene_id, websocket)

    def disconnect(self, scene_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from the scene pool."""
        conns = self._connections.get(scene_id, [])
        try:
            conns.remove(websocket)
        except ValueError:
            pass
        if not conns and scene_id in self._connections:
            del self._connections[scene_id]

    async def broadcast(self, scene_id: str, message: str) -> None:
        """Send a message to all connections subscribed to a scene."""
        conns = self._connections.get(scene_id, [])
        if not conns:
            return
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                conns.remove(ws)
            except ValueError:
                pass
        if not conns and scene_id in self._connections:
            del self._connections[scene_id]

    async def broadcast_json(self, scene_id: str, data: dict[str, object]) -> None:
        """Serialize data to JSON and broadcast to all scene connections."""
        await self.broadcast(scene_id, json.dumps(data, default=str))

    async def _send_current_status(self, scene_id: str, websocket: WebSocket) -> None:
        """Send the current pipeline status to a newly connected client."""
        try:
            from server.database import get_pipeline_status

            statuses = await get_pipeline_status(scene_id)
            for step_status in statuses:
                msg = {"type": "status", "data": step_status}
                await websocket.send_text(json.dumps(msg, default=str))
        except Exception:
            logger.exception("Failed to send current status on WS connect for %s", scene_id)
