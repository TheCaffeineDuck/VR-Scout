import { useState } from 'react';
import type { StepStatus } from '../types/pipeline';

interface UsePipelineStatusResult {
  steps: StepStatus[];
  currentStep: number | null;
}

export function usePipelineStatus(_sceneId: string): UsePipelineStatusResult {
  // TODO: Implement pipeline status polling via WebSocket
  const [steps] = useState<StepStatus[]>([]);
  const [currentStep] = useState<number | null>(null);

  return { steps, currentStep };
}
