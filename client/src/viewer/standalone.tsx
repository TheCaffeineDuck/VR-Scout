/**
 * Standalone viewer entry point.
 *
 * Renders the SceneRenderer with a hardcoded SceneConfig, independent of the
 * main app routing, sidebar, or API layer.
 *
 * Build standalone:
 *   npx vite build --config vite.config.ts
 *   (The standalone.html is registered as an additional input in vite.config.ts
 *    via build.rollupOptions.input — see the "standalone" entry.)
 *
 * Or dev-serve it directly:
 *   npx vite dev
 *   Then open http://localhost:3000/src/viewer/standalone.html
 */

import { createRoot } from 'react-dom/client';
import { SceneRenderer } from '../components/viewer/SceneRenderer.tsx';
import type { SceneConfig } from '../types/scene.ts';

// ---------- Hardcoded demo scene ----------
// Replace these URLs with your own SPZ + alignment files to preview any scene.

const DEMO_SCENE: SceneConfig = {
  id: 'standalone-demo',
  name: 'Standalone Demo Scene',
  spzUrl: '/scenes/demo.spz',
  alignmentUrl: '/scenes/demo_alignment.json',
  gaussianCount: 500_000,
  shDegree: 3,
  coordinateSystem: 'rub',
  maxStdDev: Math.sqrt(5),
};

// ---------- Allow URL params to override scene config ----------

function getSceneFromParams(): SceneConfig {
  const params = new URLSearchParams(window.location.search);
  return {
    ...DEMO_SCENE,
    spzUrl: params.get('spzUrl') ?? DEMO_SCENE.spzUrl,
    alignmentUrl: params.get('alignmentUrl') ?? DEMO_SCENE.alignmentUrl,
    name: params.get('name') ?? DEMO_SCENE.name,
  };
}

// ---------- Minimal styles for full-viewport viewer ----------

const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #viewer-root {
    width: 100%; height: 100%; overflow: hidden;
    background: #1a1a2e; color: #e0e0e0;
    font-family: system-ui, -apple-system, sans-serif;
  }
  :root {
    --surface-alt: #1a1a2e;
    --text-secondary: #a0a0b0;
    --font-mono: 'SF Mono', 'Fira Code', monospace;
    --status-completed: #4caf50;
    --status-warning: #ff9800;
    --status-failed: #f44336;
  }
`;
document.head.appendChild(style);

// ---------- Render ----------

const container = document.getElementById('viewer-root');
if (!container) throw new Error('Missing #viewer-root element');

const sceneConfig = getSceneFromParams();

createRoot(container).render(
  <SceneRenderer
    sceneConfig={sceneConfig}
    enableControls={true}
    showFloorGrid={true}
    onLoad={() => console.log('[standalone] Scene loaded')}
    onError={(err) => console.error('[standalone] Scene error:', err)}
  />,
);
