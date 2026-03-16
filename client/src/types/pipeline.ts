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
  telemetry?: {
    alignment_strategy: string;
    camera_model: string | null;
    gps_coverage: number;
    gravity_check_degrees: number | null;
    gravity_agreement: 'agree' | 'marginal' | 'disagree' | null;
  };
}

// ── SRT Upload ──────────────────────────────────────────────────

export interface SrtUploadResponse {
  status: string;
  entry_count: number;
  has_gps: boolean;
  has_gimbal: boolean;
  has_altitude: boolean;
  fps_estimate: number | null;
  gimbal_range: {
    pitch_min: number;
    pitch_max: number;
    roll_min: number;
    roll_max: number;
    yaw_min: number;
    yaw_max: number;
  } | null;
}

// ── Scene Metadata ──────────────────────────────────────────────

export interface SceneMetadata {
  container: {
    camera_make: string | null;
    camera_model: string | null;
    creation_time: string | null;
    resolution: { width: number; height: number } | null;
    duration_seconds: number | null;
    fps: number | null;
    codec: string | null;
    rotation: number;
    gps: { latitude: number; longitude: number; altitude: number | null } | null;
    has_gravity_metadata: boolean;
  };
  srt: {
    available: boolean;
    entry_count: number;
    has_gps: boolean;
    has_gimbal: boolean;
    has_altitude: boolean;
    fps_estimate: number | null;
    gps_bounds: {
      min_lat: number;
      max_lat: number;
      min_lon: number;
      max_lon: number;
      min_alt: number | null;
      max_alt: number | null;
    } | null;
    gimbal_range: {
      pitch_min: number;
      pitch_max: number;
      roll_min: number;
      roll_max: number;
      yaw_min: number;
      yaw_max: number;
    } | null;
  } | null;
  frame_matching: {
    total_frames: number;
    matched_with_gps: number;
    matched_with_gimbal: number;
    mean_match_delta_ms: number;
    max_match_delta_ms: number;
    unmatched_frames: number;
  } | null;
  alignment_strategy: 'geo_registration' | 'gimbal_gravity' | 'manhattan';
  has_real_world_scale: boolean;
}
