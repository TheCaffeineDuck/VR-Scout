export type PipelineStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'warning'
  | 'blocked'
  | 'awaiting_confirmation'
  | 'awaiting_review';

export interface StatusFile {
  scene_id: string;
  current_step: number;
  step_name: string;
  status: PipelineStatus;
  message: string;
  timestamp: string;
  pid: number;
}

export interface PipelineConfig {
  camera_model: 'SIMPLE_RADIAL' | 'OPENCV';
  matcher: 'exhaustive' | 'sequential';
  training_iterations: number;
  sh_degree: 0 | 1 | 2 | 3;
  data_factor: 1 | 2 | 4;
  frame_fps: 1 | 2 | 3;
  scene_change_threshold: number;
}

export interface ValidationReport {
  registration_rate: number;
  registered_images: number;
  total_images: number;
  mean_reprojection_error_px: number;
  point_count: number;
  camera_model: string;
  alignment_applied: boolean;
  alignment_is_identity: boolean;
  unregistered_images: string[];
  warnings: string[];
  pass: boolean;
}
