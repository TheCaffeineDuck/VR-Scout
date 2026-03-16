import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SceneListItem } from '../../api/client.ts';
import { formatNumber } from '../../utils/format.ts';
import { ConfirmDialog } from '../layout/ConfirmDialog.tsx';
import './SceneCard.css';

interface SceneCardProps {
  scene: SceneListItem;
  onDelete: (id: string) => void;
}

export function SceneCard({ scene, onDelete }: SceneCardProps) {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);

  const hasConfig = scene.config != null;

  return (
    <div className="scene-card">
      <div className="scene-card__header">
        <h3 className="scene-card__name">{scene.name}</h3>
        <button
          className="scene-card__btn scene-card__btn--ghost-danger"
          onClick={() => setShowConfirm(true)}
          title="Delete scene"
        >
          Delete
        </button>
      </div>
      {hasConfig && (
        <div className="scene-card__meta">
          <span>{formatNumber(scene.config!.gaussianCount)} Gaussians</span>
          <span className="scene-card__dot">&middot;</span>
          <span>SH{scene.config!.shDegree}</span>
        </div>
      )}
      {!hasConfig && (
        <div className="scene-card__meta">
          <span className="scene-card__status-label">
            {scene.pipeline_status ?? 'No pipeline run'}
          </span>
        </div>
      )}
      <div className="scene-card__actions">
        {hasConfig && (
          <button
            className="scene-card__btn scene-card__btn--primary"
            onClick={() => void navigate(`/scene/${scene.id}/review`)}
          >
            View
          </button>
        )}
        <button
          className="scene-card__btn"
          onClick={() => void navigate(`/scene/${scene.id}/pipeline`)}
        >
          Pipeline
        </button>
        <button
          className="scene-card__btn"
          onClick={() => void navigate(`/scene/${scene.id}/upload`)}
        >
          Re-upload
        </button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Delete Scene"
        message={`Delete scene '${scene.name}'? This will permanently remove all files including the SPZ output, training data, and raw video. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setShowConfirm(false);
          onDelete(scene.id);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
