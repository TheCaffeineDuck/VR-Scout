interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  color?: string;
}

/** Generic progress bar component */
export function ProgressBar({
  value,
  max,
  label,
  color = 'bg-blue-600',
}: ProgressBarProps): React.JSX.Element {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-sm text-gray-400 mb-1">
          <span>{label}</span>
          <span>{percent}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}
