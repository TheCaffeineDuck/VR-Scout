import type { TrainingMetric } from '../../types/pipeline';

interface TrainingMetricsPanelProps {
  metrics: TrainingMetric[];
}

/** Real-time training metrics charts (loss, PSNR, gaussian count) */
export function TrainingMetricsPanel({
  metrics,
}: TrainingMetricsPanelProps): React.JSX.Element {
  // TODO: Implement recharts line charts for loss, PSNR, and gaussian count
  return (
    <div className="training-metrics-panel">
      <h2>Training Metrics</h2>
      <p>TODO: {metrics.length} data points</p>
    </div>
  );
}
