import type { PipelineConfig, StepStatus, TrainingMetric, ValidationReport } from '../types/pipeline';
import type { SceneStatus } from '../types/scene';
import { apiFetch, apiPost } from './client';

export interface PipelineStatusResponse {
  sceneId: string;
  steps: StepStatus[];
  currentStep: number | null;
}

export interface PipelineLogResponse {
  lines: string[];
  totalLines: number;
  offset: number;
}

export interface PipelineLogEntry {
  step: number;
  line: string;
  timestamp: string;
}

export async function startPipeline(
  sceneId: string,
  config: PipelineConfig,
): Promise<void> {
  await apiPost<unknown>(`/pipeline/start/${sceneId}`, config);
}

export async function cancelPipeline(sceneId: string): Promise<void> {
  await apiPost<unknown>(`/pipeline/cancel/${sceneId}`);
}

export async function resumePipeline(sceneId: string, step?: number): Promise<void> {
  const path = step !== undefined
    ? `/pipeline/resume/${sceneId}/${String(step)}`
    : `/pipeline/resume/${sceneId}/0`;
  await apiPost<unknown>(path);
}

export async function confirmPipeline(sceneId: string): Promise<void> {
  await apiPost<unknown>(`/pipeline/confirm/${sceneId}`);
}

export async function getPipelineStatus(
  sceneId: string,
): Promise<SceneStatus> {
  return apiFetch<SceneStatus>(`/pipeline/status/${sceneId}`);
}

export async function getAllStepStatuses(
  sceneId: string,
): Promise<StepStatus[]> {
  return apiFetch<StepStatus[]>(`/pipeline/steps/${sceneId}`);
}

export async function getPipelineLogs(
  sceneId: string,
  stepNum: number,
  lines = 200,
  offset = 0,
): Promise<PipelineLogResponse> {
  return apiFetch<PipelineLogResponse>(
    `/pipeline/logs/${sceneId}/${String(stepNum)}?lines=${String(lines)}&offset=${String(offset)}`,
  );
}

export async function getValidation(sceneId: string): Promise<ValidationReport> {
  return apiFetch<ValidationReport>(`/pipeline/validation/${sceneId}`);
}

export async function getMetrics(sceneId: string): Promise<TrainingMetric[]> {
  return apiFetch<TrainingMetric[]>(`/pipeline/metrics/${sceneId}`);
}
