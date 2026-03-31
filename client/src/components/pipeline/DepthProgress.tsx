interface DepthProgressProps {
  completed: number;
  total: number;
}

/** Progress indicator for depth estimation processing */
export function DepthProgress({
  completed,
  total,
}: DepthProgressProps): React.JSX.Element {
  // TODO: Implement depth estimation progress bar with frame count
  return (
    <div className="depth-progress">
      <p>TODO: Depth progress {completed}/{total}</p>
    </div>
  );
}
