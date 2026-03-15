import { useNavigate } from 'react-router-dom';
import type { SceneConfig } from '../../types/scene.ts';
import { formatNumber } from '../../utils/format.ts';
import './SceneCard.css';

interface SceneCardProps {
  scene: SceneConfig;
}

export function SceneCard({ scene }: SceneCardProps) {
  const navigate = useNavigate();

  return (
    <div className="scene-card">
      <div className="scene-card__header">
        <h3 className="scene-card__name">{scene.name}</h3>
      </div>
      <div className="scene-card__meta">
        <span>{formatNumber(scene.gaussianCount)} Gaussians</span>
        <span className="scene-card__dot">&middot;</span>
        <span>SH{scene.shDegree}</span>
      </div>
      <div className="scene-card__actions">
        <button
          className="scene-card__btn scene-card__btn--primary"
          onClick={() => void navigate(`/scene/${scene.id}/review`)}
        >
          View
        </button>
        <button
          className="scene-card__btn"
          onClick={() => void navigate(`/scene/${scene.id}/upload`)}
        >
          Re-process
        </button>
        <button className="scene-card__btn">
          Export
        </button>
      </div>
    </div>
  );
}
