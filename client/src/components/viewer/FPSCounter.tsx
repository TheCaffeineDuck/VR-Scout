import './FPSCounter.css';

/**
 * FPSCounter — displays current FPS in the viewer.
 * This component MUST NOT import from ../pipeline/, ../upload/, ../dashboard/, or ../../api/.
 * Phase 5 will hook this into requestAnimationFrame timing.
 */

interface FPSCounterProps {
  fps?: number;
}

export function FPSCounter({ fps }: FPSCounterProps) {
  const displayFps = fps ?? 0;
  const color =
    displayFps >= 60 ? 'var(--status-completed)' :
    displayFps >= 30 ? 'var(--status-warning)' :
    'var(--status-failed)';

  return (
    <div className="fps-counter" style={{ color }}>
      {displayFps} FPS
    </div>
  );
}
