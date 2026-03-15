export const API_BASE = '/api';
export const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws`;

export const WS_RECONNECT_INTERVAL = 5000;

export const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
export const UPLOAD_MAX_SIZE = 20 * 1024 * 1024 * 1024; // 20GB
export const UPLOAD_WARN_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
export const UPLOAD_ACCEPTED_TYPES = ['.mp4', '.mov', '.avi'];

export const PIPELINE_STEPS = [
  { number: 0, name: 'Pre-flight checks' },
  { number: 1, name: 'Frame extraction' },
  { number: 2, name: 'Feature extraction' },
  { number: 3, name: 'Matching' },
  { number: 4, name: 'Mapping' },
  { number: 5, name: 'Gravity alignment' },
  { number: 6, name: 'Validation' },
  { number: 7, name: 'Training' },
  { number: 8, name: 'Conversion' },
  { number: 9, name: 'QA Review' },
] as const;

export const DEFAULT_PIPELINE_CONFIG = {
  camera_model: 'SIMPLE_RADIAL' as const,
  matcher: 'exhaustive' as const,
  training_iterations: 30000,
  sh_degree: 1 as const,
  data_factor: 1 as const,
  frame_fps: 2 as const,
  scene_change_threshold: 0.1,
};

export const DEFAULT_SETTINGS = {
  sparkVersion: '0.1.10',
  defaultTrainingIterations: 30000,
  defaultShDegree: 1 as const,
  defaultCameraModel: 'SIMPLE_RADIAL' as const,
  defaultMatcher: 'exhaustive' as const,
  maxSpzSizeMB: 50,
  maxGaussianCount: 800000,
  wsReconnectInterval: 5000,
  theme: 'system' as 'light' | 'dark' | 'system',
};

export const SETTINGS_KEY = 'vr-scout-v3:settings';
