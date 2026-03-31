import type { SceneListItem, SceneConfig } from '../types/scene';
import type { AlignmentData } from '../types/viewer';
import { apiFetch, apiPost, apiPut } from './client';

export interface CropBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ScaleParams {
  metersPerUnit: number;
}

export async function createScene(name: string): Promise<{ status: string; sceneId: string }> {
  return apiPost<{ status: string; sceneId: string }>('/scenes', { name });
}

export async function listScenes(): Promise<SceneListItem[]> {
  return apiFetch<SceneListItem[]>('/scenes');
}

export async function getSceneConfig(sceneId: string): Promise<SceneConfig> {
  return apiFetch<SceneConfig>(`/scene/${sceneId}/config`);
}

export async function updateAlignment(
  sceneId: string,
  alignment: AlignmentData,
): Promise<void> {
  await apiPut<unknown>(`/scene/${sceneId}/alignment`, alignment);
}

export async function updateCrop(
  sceneId: string,
  bounds: CropBounds,
): Promise<void> {
  await apiPut<unknown>(`/scene/${sceneId}/crop`, bounds);
}

export async function updateScale(
  sceneId: string,
  scale: ScaleParams,
): Promise<void> {
  await apiPut<unknown>(`/scene/${sceneId}/scale`, scale);
}
