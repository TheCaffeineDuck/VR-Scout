/** Format a number with comma separators (e.g. 720000 -> "720,000") */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format bytes to human-readable size (e.g. 14680064 -> "14.0 MB") */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Format seconds to human-readable duration (e.g. 747 -> "12:27") */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format seconds to a friendly ETA string (e.g. 2820 -> "~47m remaining") */
export function formatETA(seconds: number): string {
  if (seconds <= 0) return 'almost done';
  if (seconds < 60) return `~${Math.ceil(seconds)}s remaining`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m remaining`;
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `~${h}h ${m}m remaining`;
}

/** Format a percentage (e.g. 0.977 -> "97.7%") */
export function formatPercent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/** Format an ISO timestamp to a readable date string */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format an ISO timestamp to a readable date+time string */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
