import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TrainingMetric } from '../../types/ws.ts';
import { formatNumber, formatETA } from '../../utils/format.ts';
import './TrainingCharts.css';

interface TrainingChartsProps {
  metrics: TrainingMetric[];
  gpuStats?: {
    memory_used_mb: number;
    memory_total_mb: number;
    utilization_pct: number;
  } | null;
}

export function TrainingCharts({ metrics, gpuStats }: TrainingChartsProps) {
  const latest = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  // Downsample for chart performance (max 200 points)
  const step = Math.max(1, Math.floor(metrics.length / 200));
  const chartData = metrics.filter((_, i) => i % step === 0);

  const gpuPct = gpuStats
    ? Math.round((gpuStats.memory_used_mb / gpuStats.memory_total_mb) * 100)
    : 0;

  return (
    <div className="training-charts">
      <h4>Training Live Metrics</h4>

      <div className="training-charts__grid">
        <div className="training-charts__chart">
          <div className="training-charts__chart-title">PSNR (higher = better)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="iteration"
                tick={{ fontSize: 11 }}
                stroke="var(--text-tertiary)"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--text-tertiary)"
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="psnr"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="training-charts__chart">
          <div className="training-charts__chart-title">Loss (lower = better)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="iteration"
                tick={{ fontSize: 11 }}
                stroke="var(--text-tertiary)"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--text-tertiary)"
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="loss"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {latest && (
        <div className="training-charts__stats">
          <div className="training-charts__stat">
            <span className="training-charts__stat-label">Gaussians</span>
            <span className="training-charts__stat-value">
              {formatNumber(latest.gaussian_count)}
            </span>
          </div>
          {gpuStats && (
            <div className="training-charts__stat">
              <span className="training-charts__stat-label">GPU Memory</span>
              <span
                className={`training-charts__stat-value ${gpuPct > 90 ? 'training-charts__stat-value--warn' : ''}`}
              >
                {gpuStats.memory_used_mb.toFixed(1)} / {gpuStats.memory_total_mb.toFixed(1)} GB
                ({gpuPct}%)
              </span>
            </div>
          )}
          <div className="training-charts__stat">
            <span className="training-charts__stat-label">Progress</span>
            <span className="training-charts__stat-value">
              {formatNumber(latest.iteration)} / {formatNumber(latest.max_iterations)}
            </span>
          </div>
          <div className="training-charts__stat">
            <span className="training-charts__stat-label">ETA</span>
            <span className="training-charts__stat-value">
              {formatETA(latest.eta_seconds)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
