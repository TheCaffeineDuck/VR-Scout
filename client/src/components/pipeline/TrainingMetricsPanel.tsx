import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TrainingMetric } from '../../types/pipeline';

interface TrainingMetricsPanelProps {
  metrics: TrainingMetric[];
}

/** Real-time training metrics charts (loss, PSNR, gaussian count) */
export function TrainingMetricsPanel({
  metrics,
}: TrainingMetricsPanelProps): React.JSX.Element {
  if (metrics.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Training Metrics
        </h2>
        <p className="text-gray-500 text-sm">Waiting for training data...</p>
      </div>
    );
  }

  const latest = metrics[metrics.length - 1];
  const progressPct = latest.maxIterations > 0
    ? Math.round((latest.iteration / latest.maxIterations) * 100)
    : 0;

  // Downsample for chart performance if too many points
  const chartData = metrics.length > 500
    ? metrics.filter((_, i) => i % Math.ceil(metrics.length / 500) === 0)
    : metrics;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Training Metrics
        </h2>
        <span className="text-xs text-gray-500">
          {latest.iteration.toLocaleString()} / {latest.maxIterations.toLocaleString()} ({progressPct}%)
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <div className="text-lg font-semibold text-white">{latest.psnr.toFixed(1)}</div>
          <div className="text-xs text-gray-500">PSNR</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-white">{latest.loss.toFixed(4)}</div>
          <div className="text-xs text-gray-500">Loss</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-white">{(latest.gaussianCount / 1000).toFixed(0)}K</div>
          <div className="text-xs text-gray-500">Gaussians</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-white">
            {latest.etaSeconds > 0 ? `${Math.ceil(latest.etaSeconds / 60)}m` : '--'}
          </div>
          <div className="text-xs text-gray-500">ETA</div>
        </div>
      </div>

      {/* Loss chart */}
      <div>
        <h3 className="text-xs text-gray-500 mb-1">Loss</h3>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="iteration"
              tick={{ fill: '#6B7280', fontSize: 10 }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
            />
            <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
              labelFormatter={(v: number) => `Iteration ${v.toLocaleString()}`}
            />
            <Line type="monotone" dataKey="loss" stroke="#3B82F6" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* PSNR chart */}
      <div>
        <h3 className="text-xs text-gray-500 mb-1">PSNR (dB)</h3>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="iteration"
              tick={{ fill: '#6B7280', fontSize: 10 }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
            />
            <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
              labelFormatter={(v: number) => `Iteration ${v.toLocaleString()}`}
            />
            <Line type="monotone" dataKey="psnr" stroke="#10B981" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
