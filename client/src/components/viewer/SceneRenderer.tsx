import type { ViewerProps } from '../../types/scene.ts';
import './SceneRenderer.css';

/**
 * SceneRenderer — core viewer component (extractable as standalone).
 * This component MUST NOT import from ../pipeline/, ../upload/, ../dashboard/, or ../../api/.
 * It only accepts a ViewerProps interface.
 *
 * Phase 5 will integrate the Spark Gaussian Splat renderer here.
 */
export function SceneRenderer({ sceneConfig, onLoad, onError }: ViewerProps) {
  // Notify parent that loading is complete (placeholder)
  if (onLoad) {
    // Will be called after Spark renderer initializes in Phase 5
  }
  if (onError) {
    // Will be called on renderer errors in Phase 5
  }

  return (
    <div className="scene-renderer">
      <div className="scene-renderer__placeholder">
        <div className="scene-renderer__icon">&#x1F4F7;</div>
        <h3>3D Viewer</h3>
        <p>Integrated in Phase 5</p>
        <p className="scene-renderer__scene-name">{sceneConfig.name}</p>
      </div>
    </div>
  );
}
