/** Displays COLMAP camera frustums in the 3D viewer */
export function CameraPathViewer(): React.JSX.Element {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Camera Path
      </h3>
      <div className="h-32 bg-gray-900 rounded-lg flex items-center justify-center">
        <p className="text-sm text-gray-500">Camera frustum overlay (3D integration pending)</p>
      </div>
    </div>
  );
}
