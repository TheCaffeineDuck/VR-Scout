import type { StatusFile } from './pipeline';

export interface TrainingMetric {
  iteration: number;
  max_iterations: number;
  loss: number;
  psnr: number;
  gaussian_count: number;
  elapsed_seconds: number;
  eta_seconds: number;
}

export type WSMessage =
  | { type: 'status'; data: StatusFile }
  | { type: 'metric'; data: TrainingMetric }
  | { type: 'log_line'; data: { step: number; line: string } }
  | { type: 'warning'; data: { message: string } }
  | { type: 'gpu'; data: { memory_used_mb: number; memory_total_mb: number; utilization_pct: number } };
