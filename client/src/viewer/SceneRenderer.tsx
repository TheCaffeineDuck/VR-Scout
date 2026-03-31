import type { ViewerProps } from '../types/viewer';

/** Core scene renderer component for gaussian splat visualization */
export function SceneRenderer({
  sceneConfig,
  enableVR: _enableVR,
  enableControls: _enableControls,
  onLoad: _onLoad,
  onError: _onError,
  onProgress: _onProgress,
}: ViewerProps): React.JSX.Element {
  // TODO: Implement R3F Canvas with Spark gaussian splat rendering
  return (
    <div className="scene-renderer">
      <p>TODO: Scene renderer for {sceneConfig.name}</p>
    </div>
  );
}
