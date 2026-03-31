import type { SceneListItem, SceneConfig } from '../types/scene';
import type { AlignmentData } from '../types/viewer';

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

export async function listScenes(): Promise<SceneListItem[]> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function getSceneConfig(_sceneId: string): Promise<SceneConfig> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function updateAlignment(
  _sceneId: string,
  _alignment: AlignmentData,
): Promise<void> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function updateCrop(
  _sceneId: string,
  _bounds: CropBounds,
): Promise<void> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}

export async function updateScale(
  _sceneId: string,
  _scale: ScaleParams,
): Promise<void> {
  // TODO: not implemented
  throw new Error('TODO: not implemented');
}
