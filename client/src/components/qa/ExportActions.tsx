import type { SceneConfig } from '../../types/scene';

interface ExportActionsProps {
  config: SceneConfig | null;
}

/** VR launch, export, and download action buttons */
export function ExportActions({ config }: ExportActionsProps): React.JSX.Element {
  if (!config) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-500">No scene config loaded</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Export
      </h3>

      <div className="space-y-2">
        {config.desktopSpzUrl && (
          <a
            href={config.desktopSpzUrl}
            download
            className="block w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm text-center transition-colors"
          >
            Download Desktop SPZ
          </a>
        )}

        {config.questSpzUrl && (
          <a
            href={config.questSpzUrl}
            download
            className="block w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm text-center transition-colors"
          >
            Download Quest SPZ
          </a>
        )}

        {config.flythroughVideoUrl && (
          <a
            href={config.flythroughVideoUrl}
            download
            className="block w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm text-center transition-colors"
          >
            Download Flythrough Video
          </a>
        )}

        <button
          className="block w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm text-center transition-colors"
          onClick={() => {
            // VR launch placeholder
            window.open(config.desktopSpzUrl, '_blank');
          }}
        >
          Launch in VR
        </button>
      </div>
    </div>
  );
}
