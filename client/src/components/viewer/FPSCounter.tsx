import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import './FPSCounter.css';

/**
 * FPSCounter — measures FPS via R3F useFrame and reports via callback.
 * This component MUST NOT import from ../pipeline/, ../upload/, ../dashboard/, or ../../api/.
 *
 * Must be placed inside an R3F Canvas. Updates every 500ms for smooth display.
 */

interface FPSMeasureProps {
  onFps: (fps: number) => void;
}

/** R3F component that measures FPS via useFrame. Place inside Canvas. */
export function FPSMeasure({ onFps }: FPSMeasureProps) {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const onFpsRef = useRef(onFps);
  onFpsRef.current = onFps;

  useFrame(() => {
    frameCount.current++;
    const now = performance.now();
    const elapsed = now - lastTime.current;
    if (elapsed >= 500) {
      const fps = Math.round((frameCount.current / elapsed) * 1000);
      onFpsRef.current(fps);
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  return null;
}

interface FPSCounterProps {
  fps: number;
}

/** HTML overlay that displays the FPS value. Place outside Canvas, positioned absolutely. */
export function FPSCounter({ fps }: FPSCounterProps) {
  const color =
    fps >= 60
      ? 'var(--status-completed)'
      : fps >= 30
        ? 'var(--status-warning)'
        : 'var(--status-failed)';

  return (
    <div className="fps-counter" style={{ color }}>
      {fps} FPS
    </div>
  );
}
