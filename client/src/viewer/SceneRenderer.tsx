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
  return (
    <div className="w-full h-full min-h-[400px] bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center">
      <div className="text-center text-gray-500">
        <p className="text-sm">Scene Renderer: {sceneConfig.name}</p>
        <p className="text-xs mt-1">R3F Canvas + Spark splat renderer (pending integration)</p>
      </div>
    </div>
  );
}
