export interface SceneConfig {
  id: string;
  name: string;
  spzUrl: string;
  alignmentUrl: string;
  gaussianCount: number;
  shDegree: 0 | 1 | 2 | 3;
  coordinateSystem: 'rub';
  maxStdDev?: number;
  lodEnabled?: boolean;
  mobileBudget?: number;
}

export interface ViewerProps {
  sceneConfig: SceneConfig;
  enableVR?: boolean;
  enableControls?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;
}
