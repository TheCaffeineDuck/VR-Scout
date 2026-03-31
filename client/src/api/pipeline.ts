import type { PipelineConfig, StepStatus } from '../types/pipeline';

export interface PipelineStatusResponse {
  sceneId: string;
  steps: StepStatus[];
  currentStep: number | null;
}

export interface PipelineLogEntry {
  step: number;
  line: string;
  timestamp: string;
}

export async function startPipeline(
  _sceneId: string,
  _config: PipelineConfig,
): Promise<void> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function cancelPipeline(_sceneId: string): Promise<void> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function resumePipeline(_sceneId: string): Promise<void> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function getPipelineStatus(
  _sceneId: string,
): Promise<PipelineStatusResponse> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function getPipelineLogs(
  _sceneId: string,
  _stepNum: number,
): Promise<PipelineLogEntry[]> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}
