import { Link, useLocation } from 'react-router-dom';
import { useScenes } from '../../hooks/useScenes';
import { StatusIcon } from '../common/StatusIcon';

/** Scene list sidebar navigation */
export function Sidebar(): React.JSX.Element {
  const { scenes } = useScenes();
  const location = useLocation();

  return (
    <nav className="w-64 h-screen bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-800">
        <Link to="/" className="text-lg font-bold text-white hover:text-blue-400 transition-colors">
          VR Scout
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Scenes
        </div>
        {scenes.map((scene) => {
          const isActive = location.pathname.includes(scene.id);
          return (
            <Link
              key={scene.id}
              to={`/pipeline/${scene.id}`}
              className={`flex items-center gap-2 px-4 py-2 mx-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <StatusIcon status={scene.status} size="sm" />
              <span className="truncate">{scene.name}</span>
            </Link>
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-800 space-y-1">
        <Link
          to="/"
          className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
            location.pathname === '/'
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
          }`}
        >
          Dashboard
        </Link>
        <Link
          to="/upload"
          className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
            location.pathname === '/upload'
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
          }`}
        >
          New Upload
        </Link>
        <Link
          to="/settings"
          className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
            location.pathname === '/settings'
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
          }`}
        >
          Settings
        </Link>
      </div>
    </nav>
  );
}
