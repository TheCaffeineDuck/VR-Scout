import { ProgressBar } from '../common/ProgressBar';

interface DepthProgressProps {
  completed: number;
  total: number;
}

/** Progress indicator for depth estimation processing */
export function DepthProgress({
  completed,
  total,
}: DepthProgressProps): React.JSX.Element {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-300">Depth Estimation</h3>
        <span className="text-xs text-gray-500">
          {completed} / {total} frames
        </span>
      </div>
      <ProgressBar value={completed} max={total} color="bg-purple-600" />
    </div>
  );
}
