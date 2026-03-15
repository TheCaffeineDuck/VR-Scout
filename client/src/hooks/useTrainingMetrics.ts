import { useWebSocket } from '../api/ws.ts';
import type { TrainingMetric } from '../types/ws.ts';

export interface UseTrainingMetricsResult {
  metrics: TrainingMetric[];
  latest: TrainingMetric | null;
  connected: boolean;
}

export function useTrainingMetrics(sceneId: string | undefined): UseTrainingMetricsResult {
  const ws = useWebSocket(sceneId);
  const latest = ws.metrics.length > 0 ? ws.metrics[ws.metrics.length - 1] : null;
  return {
    metrics: ws.metrics,
    latest,
    connected: ws.connected,
  };
}
