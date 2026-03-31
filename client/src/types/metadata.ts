export interface GPSCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface FrameMetadata {
  frameIndex: number;
  timestampMs: number;
  quaternion?: number[];
  gravityVector?: number[];
  accelerometer?: number[];
  gps?: GPSCoordinate;
  iso?: number;
  shutterSpeed?: string;
  whiteBalance?: number;
}

export interface SRTData {
  frames: FrameMetadata[];
  hasGravity: boolean;
  hasGps: boolean;
}

export interface HardwareProfile {
  gpuName: string;
  gpuVramGb: number;
  computeCapability: string;
  smArchitecture: number;
  cudaToolkitVersion: string;
  cudaHome: string;
  profile: 'full' | 'standard' | 'constrained' | 'unknown';
  detectedAt?: string;
}
