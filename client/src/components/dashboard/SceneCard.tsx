import type { SceneListItem } from '../../types/scene';

interface SceneCardProps {
  scene: SceneListItem;
}

/** Card displaying scene summary with status and gaussian count */
export function SceneCard({ scene }: SceneCardProps): React.JSX.Element {
  // TODO: Implement scene card with thumbnail, status badge, and actions
  return (
    <div className="scene-card">
      <h3>{scene.name}</h3>
      <span>{scene.status}</span>
    </div>
  );
}
