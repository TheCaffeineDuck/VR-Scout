import type { SceneConfig } from '../types/scene.ts';
import type { PipelineConfig, SceneMetadata, SrtUploadResponse, StatusFile, ValidationReport } from '../types/pipeline.ts';
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
    // Extract detail from JSON error responses (FastAPI format)
    let message = text;
    try {
      const json = JSON.parse(text) as { detail?: string };
      if (typeof json.detail === 'string') message = json.detail;
    } catch {
      // Not JSON, use raw text
    }
    throw new ApiError(res.status, message || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- Scenes ---

export interface SceneListItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  config: SceneConfig | null;
  latest_run_id: string | null;
  pipeline_status: string | null;
}

export function getScenes(): Promise<SceneListItem[]> {
  return request<SceneListItem[]>('/scenes');
}

export function getSceneConfig(id: string): Promise<SceneConfig> {
  return request<SceneConfig>(`/scene/${encodeURIComponent(id)}/config`);
}

export interface SceneCreateRequest {
  id: string;
  name: string;
}

export interface SceneRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  config: SceneConfig | null;
  latest_run_id: string | null;
}

export function createScene(body: SceneCreateRequest): Promise<SceneRow> {
  return request<SceneRow>('/scenes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteScene(id: string): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(`/scenes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export interface DeleteVideoResponse {
  deleted_video: boolean;
  freed_mb: number;
}

export function deleteSceneVideo(id: string): Promise<DeleteVideoResponse> {
  return request<DeleteVideoResponse>(`/scene/${encodeURIComponent(id)}/video`, {
    method: 'DELETE',
  });
}

// --- Upload ---

export interface UploadChunkResponse {
  status: 'partial' | 'complete';
  chunk_index: number;
  total_chunks: number;
  received?: number;
  file_path?: string;
  file_size_bytes?: number;
  video_metadata?: Record<string, unknown>;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  chunkIndex: number;
  totalChunks: number;
}

const UPLOAD_MAX_RETRIES = 3;

async function uploadChunkWithRetry(
  url: string,
  formData: FormData,
  signal: AbortSignal | undefined,
): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < UPLOAD_MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new ApiError(res.status, text);
      }
      return;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < UPLOAD_MAX_RETRIES - 1) {
        // Exponential backoff: 1s, 2s
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error('Upload chunk failed after retries');
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
    formData.append('file', chunk);
    formData.append('scene_id', sceneId);
    formData.append('chunk_index', String(i));
    formData.append('total_chunks', String(totalChunks));
    formData.append('filename', file.name);

    await uploadChunkWithRetry(`${API_BASE}/upload/chunk`, formData, signal);

    onProgress?.({
      loaded: end,
      total: file.size,
      chunkIndex: i + 1,
      totalChunks,
    });
  }
}

// --- SRT Upload ---

export async function uploadSrt(
  sceneId: string,
  file: File,
): Promise<SrtUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(
    `${API_BASE}/upload/srt/${encodeURIComponent(sceneId)}`,
    { method: 'POST', body: formData },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let message = text;
    try {
      const json = JSON.parse(text) as { detail?: string };
      if (typeof json.detail === 'string') message = json.detail;
    } catch {
      // Not JSON
    }
    throw new ApiError(res.status, message || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<SrtUploadResponse>;
}

export function deleteSrt(sceneId: string): Promise<{ status: string }> {
  return request<{ status: string }>(
    `/upload/srt/${encodeURIComponent(sceneId)}`,
    { method: 'DELETE' },
  );
}

// --- Scene Metadata ---

export function getSceneMetadata(sceneId: string): Promise<SceneMetadata> {
  return request<SceneMetadata>(
    `/scene/${encodeURIComponent(sceneId)}/metadata`,
  );
}

// --- Pipeline ---

export interface PipelineActionResponse {
  run_id?: string;
  status: string;
}

export function startPipeline(
  sceneId: string,
  config: PipelineConfig,
): Promise<PipelineActionResponse> {
  return request<PipelineActionResponse>(`/pipeline/start/${encodeURIComponent(sceneId)}`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export function cancelPipeline(sceneId: string): Promise<PipelineActionResponse> {
  return request<PipelineActionResponse>(`/pipeline/cancel/${encodeURIComponent(sceneId)}`, {
    method: 'POST',
  });
}

export function resumePipeline(
  sceneId: string,
  step: number,
  config: PipelineConfig,
): Promise<PipelineActionResponse> {
  return request<PipelineActionResponse>(
    `/pipeline/resume/${encodeURIComponent(sceneId)}/${step}`,
    { method: 'POST', body: JSON.stringify(config) },
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

// --- Sparse Cloud ---

export interface SparseCloudPoint {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

export interface SparseCloudCamera {
  image_name: string;
  registered: boolean;
  position: [number, number, number];
  rotation_matrix: number[][];
  reprojection_error: number;
}

export interface SparseCloudSummary {
  total_points: number;
  total_images: number;
  registered_images: number;
  mean_reprojection_error: number;
}

export interface SparseCloudData {
  points: SparseCloudPoint[];
  cameras: SparseCloudCamera[];
  summary: SparseCloudSummary;
}

export function getSparseCloud(
  sceneId: string,
  source: 'sparse' | 'aligned' = 'sparse',
): Promise<SparseCloudData> {
  const params = source !== 'sparse' ? `?source=${source}` : '';
  return request<SparseCloudData>(
    `/scene/${encodeURIComponent(sceneId)}/sparse_cloud${params}`,
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
