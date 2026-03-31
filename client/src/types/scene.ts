export interface GaussianCount {
  desktop: number;
  quest: number;
}

export interface SceneConfig {
  id: string;
  name: string;
  desktopSpzUrl: string;
  questSpzUrl: string;
  alignmentUrl: string;
  collisionMeshUrl?: string;
  environmentMapUrl?: string;
  flythroughVideoUrl?: string;
  gaussianCount: GaussianCount;
  shDegree: 0 | 1 | 2 | 3;
  coordinateSystem: 'rub';
  maxStdDev?: number;
  scaleMetric?: boolean;
  scaleMetersPerUnit?: number;
}

export interface SceneStatus {
  sceneId: string;
  status: string;
  currentStep?: number;
  currentStepName?: string;
  message?: string;
}

export interface SceneRun {
  id: string;
  sceneId: string;
  configJson: string;
  startedAt?: string;
  completedAt?: string;
  status: string;
}

export interface SceneListItem {
  id: string;
  name: string;
  status: string;
  gaussianCount?: GaussianCount;
  createdAt: string;
}
