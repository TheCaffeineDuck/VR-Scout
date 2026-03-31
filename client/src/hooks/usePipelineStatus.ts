import { useState, useEffect } from 'react';
import type { StepStatus } from '../types/pipeline';
import type { WSMessage } from '../types/pipeline';
import { getAllStepStatuses } from '../api/pipeline';
import { useWebSocket } from './useWebSocket';

interface UsePipelineStatusResult {
  steps: StepStatus[];
  currentStep: number | null;
  connected: boolean;
  lastMessage: WSMessage | null;
}

export function usePipelineStatus(sceneId: string): UsePipelineStatusResult {
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const { connected, lastMessage } = useWebSocket(sceneId);

  // Fetch initial step statuses from REST
  useEffect(() => {
    if (!sceneId) return;
    let cancelled = false;

    getAllStepStatuses(sceneId)
      .then((data) => {
        if (cancelled) return;
        setSteps(data);
        const running = data.find((s) => s.status === 'running');
        setCurrentStep(running ? running.stepNum : null);
      })
      .catch(() => {
        // ignore fetch errors, will retry via WS
      });

    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  // Update from WS status messages
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'status') {
      const updated = lastMessage.data;
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.stepNum === updated.stepNum);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated].sort((a, b) => a.stepNum - b.stepNum);
      });
      if (updated.status === 'running') {
        setCurrentStep(updated.stepNum);
      }
    }
  }, [lastMessage]);

  return { steps, currentStep, connected, lastMessage };
}
