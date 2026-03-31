/** Spark viewer wrapper for scene preview */
export function ScenePreview(): React.JSX.Element {
  return (
    <div className="w-full h-full min-h-[400px] bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center">
      <div className="text-center text-gray-500">
        <div className="text-4xl mb-2">3D</div>
        <p className="text-sm">Gaussian Splat Viewer</p>
        <p className="text-xs mt-1">Spark renderer will load here</p>
      </div>
    </div>
  );
}
