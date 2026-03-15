"""WebSocket connection manager for real-time pipeline updates."""

import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections per scene_id.

    Multiple clients can subscribe to the same scene_id.
    Messages are broadcast to all connected clients for that scene.
    """

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, scene_id: str, websocket: WebSocket) -> None:
        """Accept a WebSocket connection and register it for a scene."""
        await websocket.accept()
        self._connections[scene_id].append(websocket)
        logger.info("WS client connected for scene %s (%d total)", scene_id, len(self._connections[scene_id]))

    def disconnect(self, scene_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        conns = self._connections.get(scene_id, [])
        if websocket in conns:
            conns.remove(websocket)
            if not conns:
                del self._connections[scene_id]
        logger.info("WS client disconnected for scene %s", scene_id)

    async def broadcast(self, scene_id: str, message: dict[str, object]) -> None:
        """Send a JSON message to all clients connected to a scene."""
        conns = self._connections.get(scene_id, [])
        disconnected: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(scene_id, ws)

    def get_connection_count(self, scene_id: str) -> int:
        """Get the number of connected clients for a scene."""
        return len(self._connections.get(scene_id, []))

    def get_all_scenes(self) -> list[str]:
        """Get all scene IDs with active connections."""
        return list(self._connections.keys())


# Singleton instance
manager = ConnectionManager()
