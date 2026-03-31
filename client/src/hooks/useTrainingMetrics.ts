import { useState, useEffect } from 'react';
import type { TrainingMetric, WSMessage } from '../types/pipeline';
import { getMetrics } from '../api/pipeline';

interface UseTrainingMetricsResult {
  metrics: TrainingMetric[];
}

export function useTrainingMetrics(sceneId: string, lastMessage: WSMessage | null): UseTrainingMetricsResult {
  const [metrics, setMetrics] = useState<TrainingMetric[]>([]);

  // Fetch initial metrics from REST
  useEffect(() => {
    if (!sceneId) return;
    let cancelled = false;

    getMetrics(sceneId)
      .then((data) => {
        if (cancelled) return;
        setMetrics(data);
      })
      .catch(() => {
        // no metrics yet, that's fine
      });

    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  // Accumulate from WS metric messages
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'metric') {
      setMetrics((prev) => [...prev, lastMessage.data]);
    }
  }, [lastMessage]);

  return { metrics };
}
