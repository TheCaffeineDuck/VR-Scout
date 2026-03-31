interface PruningProgressProps {
  currentCount: number;
  targetCount: number;
}

/** Progress indicator for perceptual pruning */
export function PruningProgress({
  currentCount,
  targetCount,
}: PruningProgressProps): React.JSX.Element {
  // TODO: Implement pruning progress with current/target gaussian counts
  return (
    <div className="pruning-progress">
      <p>TODO: Pruning {currentCount} -&gt; {targetCount}</p>
    </div>
  );
}
