import { useState } from 'react';
import type { TrainingMetric } from '../types/pipeline';

interface UseTrainingMetricsResult {
  metrics: TrainingMetric[];
}

export function useTrainingMetrics(_sceneId: string): UseTrainingMetricsResult {
  // TODO: Implement training metrics collection via WebSocket
  const [metrics] = useState<TrainingMetric[]>([]);

  return { metrics };
}
