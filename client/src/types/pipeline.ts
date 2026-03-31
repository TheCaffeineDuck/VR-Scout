export interface PipelineConfig {
  cameraModel: 'SIMPLE_RADIAL' | 'OPENCV';
  matcher: 'exhaustive' | 'sequential' | 'spatial';
  trainingIterations: number;
  shDegree: 0 | 1 | 2 | 3;
  dataFactor: 1 | 2 | 4;
  frameFps: 1 | 2 | 3;
  sceneChangeThreshold: number;
  depthEstimation: boolean;
  depthModelSize: 'Small' | 'Base' | 'Large';
  segmentation: 'on' | 'off' | 'auto';
  perceptualPruning: boolean;
  questGaussianBudget: number;
  desktopGaussianBudget: number;
}

export interface StepStatus {
  stepNum: number;
  stepName: string;
  status: string;
  message?: string;
  timestamp?: string;
  pid?: number;
}

export interface TrainingMetric {
  iteration: number;
  maxIterations: number;
  loss: number;
  depthLoss?: number;
  psnr: number;
  gaussianCount: number;
  elapsedSeconds: number;
  etaSeconds: number;
}

export interface ValidationReport {
  registrationRate: number;
  reprojectionError: number;
  pointCount: number;
  cameraModel: string;
  imageCount: number;
  alignmentStatus: string;
}

export type WSMessage =
  | { type: 'status'; data: StepStatus }
  | { type: 'metric'; data: TrainingMetric }
  | { type: 'log_line'; data: { step: number; line: string } }
  | { type: 'warning'; data: { message: string } }
  | { type: 'gpu'; data: { memoryUsedMb: number; memoryTotalMb: number; utilizationPct: number } }
  | { type: 'depth_progress'; data: { completed: number; total: number } }
  | { type: 'pruning_progress'; data: { currentCount: number; targetCount: number } }
  | { type: 'video_progress'; data: { frame: number; totalFrames: number } };
