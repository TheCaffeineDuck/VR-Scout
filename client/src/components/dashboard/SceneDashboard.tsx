import { Link } from 'react-router-dom';
import { useScenes } from '../../hooks/useScenes';
import { SceneCard } from './SceneCard';

/** Dashboard showing grid of scene cards */
export function SceneDashboard(): React.JSX.Element {
  const { scenes, loading, error, refresh } = useScenes();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Scenes</h1>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm text-white rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">Loading scenes...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <Link
            to="/upload"
            className="flex flex-col items-center justify-center bg-gray-800 border border-dashed border-gray-600 rounded-lg p-6 hover:border-blue-500 hover:bg-gray-800/80 transition-colors min-h-[140px]"
          >
            <span className="text-3xl text-gray-500 mb-2">+</span>
            <span className="text-sm text-gray-400">New Scene</span>
          </Link>

          {scenes.map((scene) => (
            <SceneCard key={scene.id} scene={scene} />
          ))}
        </div>
      )}
    </div>
  );
}
