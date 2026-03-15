import { useEffect, useRef, useState, useCallback } from 'react';
import type { StatusFile } from '../types/pipeline.ts';
import type { WSMessage, TrainingMetric } from '../types/ws.ts';
import { WS_RECONNECT_INTERVAL } from '../utils/constants.ts';

export interface WSState {
  status: StatusFile | null;
  metrics: TrainingMetric[];
  logLines: string[];
  warnings: string[];
  gpuStats: { memory_used_mb: number; memory_total_mb: number; utilization_pct: number } | null;
  connected: boolean;
}

export function useWebSocket(sceneId: string | undefined): WSState {
  const [state, setState] = useState<WSState>({
    status: null,
    metrics: [],
    logLines: [],
    warnings: [],
    gpuStats: null,
    connected: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (!sceneId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws/${encodeURIComponent(sceneId)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true }));
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      wsRef.current = null;
      reconnectTimerRef.current = setTimeout(connect, WS_RECONNECT_INTERVAL);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data)) as WSMessage;
        setState((prev) => {
          switch (msg.type) {
            case 'status':
              return { ...prev, status: msg.data };
            case 'metric':
              return { ...prev, metrics: [...prev.metrics, msg.data] };
            case 'log_line':
              return {
                ...prev,
                logLines: [...prev.logLines.slice(-199), msg.data.line],
              };
            case 'warning':
              return { ...prev, warnings: [...prev.warnings, msg.data.message] };
            case 'gpu':
              return { ...prev, gpuStats: msg.data };
            default:
              return prev;
          }
        });
      } catch {
        // Ignore malformed messages
      }
    };
  }, [sceneId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return state;
}
