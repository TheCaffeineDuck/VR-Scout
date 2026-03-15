import type { SceneConfig } from '../types/scene.ts';
import type { PipelineConfig, StatusFile, ValidationReport } from '../types/pipeline.ts';
import type { TrainingMetric } from '../types/ws.ts';
import { API_BASE, UPLOAD_CHUNK_SIZE } from '../utils/constants.ts';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

// --- Scenes ---

export function getScenes(): Promise<SceneConfig[]> {
  return request<SceneConfig[]>('/scenes');
}

export function getSceneConfig(id: string): Promise<SceneConfig> {
  return request<SceneConfig>(`/scene/${encodeURIComponent(id)}/config`);
}

// --- Upload ---

export interface UploadChunkResponse {
  received: number;
  total: number;
  complete: boolean;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  chunkIndex: number;
  totalChunks: number;
}

export async function uploadFileChunked(
  sceneId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');

    const start = i * UPLOAD_CHUNK_SIZE;
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('scene_id', sceneId);
    formData.append('chunk_index', String(i));
    formData.append('total_chunks', String(totalChunks));
    formData.append('filename', file.name);

    const res = await fetch(`${API_BASE}/upload/chunk`, {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ApiError(res.status, text);
    }

    onProgress?.({
      loaded: end,
      total: file.size,
      chunkIndex: i + 1,
      totalChunks,
    });
  }
}

// --- Pipeline ---

export function startPipeline(
  sceneId: string,
  config: PipelineConfig,
): Promise<StatusFile> {
  return request<StatusFile>(`/pipeline/start/${encodeURIComponent(sceneId)}`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export function cancelPipeline(sceneId: string): Promise<StatusFile> {
  return request<StatusFile>(`/pipeline/cancel/${encodeURIComponent(sceneId)}`, {
    method: 'POST',
  });
}

export function resumePipeline(
  sceneId: string,
  step: number,
): Promise<StatusFile> {
  return request<StatusFile>(
    `/pipeline/resume/${encodeURIComponent(sceneId)}/${step}`,
    { method: 'POST' },
  );
}

export function getPipelineStatus(sceneId: string): Promise<StatusFile> {
  return request<StatusFile>(`/pipeline/status/${encodeURIComponent(sceneId)}`);
}

export async function getPipelineLogs(
  sceneId: string,
  step: number,
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/pipeline/logs/${encodeURIComponent(sceneId)}/${step}`,
  );
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  }
  return res.text();
}

export function getValidationReport(sceneId: string): Promise<ValidationReport> {
  return request<ValidationReport>(
    `/pipeline/validation/${encodeURIComponent(sceneId)}`,
  );
}

export function getTrainingMetrics(sceneId: string): Promise<TrainingMetric[]> {
  return request<TrainingMetric[]>(
    `/pipeline/metrics/${encodeURIComponent(sceneId)}`,
  );
}

// --- Alignment ---

export interface AlignmentData {
  y_offset: number;
  y_rotation: number;
}

export function updateAlignment(
  sceneId: string,
  alignment: AlignmentData,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/scene/${encodeURIComponent(sceneId)}/alignment`,
    {
      method: 'PUT',
      body: JSON.stringify(alignment),
    },
  );
}

// --- Cameras ---

export interface CameraPosition {
  id: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
  image_name: string;
}

export function getCameras(sceneId: string): Promise<CameraPosition[]> {
  return request<CameraPosition[]>(
    `/scene/${encodeURIComponent(sceneId)}/cameras`,
  );
}
