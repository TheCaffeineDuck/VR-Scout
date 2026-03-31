import { Link } from 'react-router-dom';
import type { SceneListItem } from '../../types/scene';
import { StatusIcon } from '../common/StatusIcon';

interface SceneCardProps {
  scene: SceneListItem;
}

/** Card displaying scene summary with status and gaussian count */
export function SceneCard({ scene }: SceneCardProps): React.JSX.Element {
  const isComplete = scene.status === 'complete' || scene.status === 'completed' || scene.status === 'done';
  const linkTo = isComplete ? `/review/${scene.id}` : `/pipeline/${scene.id}`;

  return (
    <Link
      to={linkTo}
      className="block bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-white font-medium truncate pr-2">{scene.name}</h3>
        <StatusIcon status={scene.status} />
      </div>

      <div className="text-sm text-gray-400 space-y-1">
        <div className="flex items-center gap-1">
          <span className="capitalize">{scene.status}</span>
        </div>
        {scene.gaussianCount && (
          <div className="flex gap-3 text-xs">
            <span>Desktop: {scene.gaussianCount.desktop.toLocaleString()}</span>
            <span>Quest: {scene.gaussianCount.quest.toLocaleString()}</span>
          </div>
        )}
        <div className="text-xs text-gray-500">
          {new Date(scene.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Link>
  );
}
