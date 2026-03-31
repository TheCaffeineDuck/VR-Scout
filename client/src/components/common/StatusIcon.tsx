interface StatusIconProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-500',
  queued: 'bg-gray-500',
  running: 'bg-blue-500 animate-pulse',
  complete: 'bg-green-500',
  completed: 'bg-green-500',
  done: 'bg-green-500',
  error: 'bg-red-500',
  failed: 'bg-red-500',
  cancelled: 'bg-yellow-500',
  paused: 'bg-yellow-500',
  waiting: 'bg-yellow-500',
  created: 'bg-gray-400',
};

/** Status indicator icon (pending, running, complete, error) */
export function StatusIcon({ status, size = 'md' }: StatusIconProps): React.JSX.Element {
  const colorClass = statusColors[status.toLowerCase()] ?? 'bg-gray-500';
  const sizeClass = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <span
      className={`inline-block rounded-full ${sizeClass} ${colorClass}`}
      title={status}
      data-status={status}
    />
  );
}
