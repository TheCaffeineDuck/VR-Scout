import { useState } from 'react';
import type { WSMessage } from '../types/pipeline';

interface UseWebSocketResult {
  connected: boolean;
  lastMessage: WSMessage | null;
}

export function useWebSocket(_sceneId: string): UseWebSocketResult {
  // TODO: Implement WebSocket connection to /api/ws/:sceneId
  const [connected] = useState(false);
  const [lastMessage] = useState<WSMessage | null>(null);

  return { connected, lastMessage };
}
