import type { SceneConfig } from './scene';

export interface ViewerProps {
  sceneConfig: SceneConfig;
  enableVR?: boolean;
  enableControls?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;
}

export interface AlignmentData {
  transform: number[];
  floorY: number;
  scaleMetersPerUnit?: number;
}

export interface FloorPlane {
  y: number;
  normal: [number, number, number];
}
