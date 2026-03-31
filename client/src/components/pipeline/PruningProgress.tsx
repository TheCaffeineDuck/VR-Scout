import { ProgressBar } from '../common/ProgressBar';

interface PruningProgressProps {
  currentCount: number;
  targetCount: number;
}

/** Progress indicator for perceptual pruning */
export function PruningProgress({
  currentCount,
  targetCount,
}: PruningProgressProps): React.JSX.Element {
  // Progress is measured as how far we've pruned from start toward target
  // currentCount goes DOWN toward targetCount
  const pruned = currentCount > targetCount ? currentCount - targetCount : 0;
  const total = currentCount > targetCount ? currentCount : 1;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-300">Perceptual Pruning</h3>
        <span className="text-xs text-gray-500">
          {currentCount.toLocaleString()} → {targetCount.toLocaleString()}
        </span>
      </div>
      <ProgressBar
        value={pruned}
        max={total}
        color="bg-orange-600"
      />
    </div>
  );
}
