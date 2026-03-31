interface ProgressBarProps {
  value: number;
  max: number;
}

/** Generic progress bar component */
export function ProgressBar({
  value,
  max,
}: ProgressBarProps): React.JSX.Element {
  // TODO: Implement styled progress bar with percentage label
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress-bar">
      <div style={{ width: `${String(percent)}%` }} />
    </div>
  );
}
