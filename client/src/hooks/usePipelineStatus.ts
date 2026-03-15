import { useWebSocket } from '../api/ws.ts';
import type { StatusFile } from '../types/pipeline.ts';

export interface UsePipelineStatusResult {
  status: StatusFile | null;
  logLines: string[];
  warnings: string[];
  gpuStats: { memory_used_mb: number; memory_total_mb: number; utilization_pct: number } | null;
  connected: boolean;
}

export function usePipelineStatus(sceneId: string | undefined): UsePipelineStatusResult {
  const ws = useWebSocket(sceneId);
  return {
    status: ws.status,
    logLines: ws.logLines,
    warnings: ws.warnings,
    gpuStats: ws.gpuStats,
    connected: ws.connected,
  };
}
