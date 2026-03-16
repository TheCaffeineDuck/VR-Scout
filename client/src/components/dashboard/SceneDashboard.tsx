import { useNavigate } from 'react-router-dom';
import { useScenes, refreshAllScenes } from '../../hooks/useScenes.ts';
import { deleteScene } from '../../api/client.ts';
import { SceneCard } from './SceneCard.tsx';
import './SceneDashboard.css';

export function SceneDashboard() {
  const { scenes, loading, error, refresh } = useScenes();
  const navigate = useNavigate();

  const handleDelete = (id: string) => {
    void deleteScene(id).then(() => refreshAllScenes());
  };

  return (
    <div className="scene-dashboard">
      <div className="scene-dashboard__header">
        <h2>Scenes</h2>
        <button className="btn btn--ghost" onClick={refresh}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="scene-dashboard__error">
          Failed to load scenes: {error}
        </div>
      )}

      {loading && <div className="scene-dashboard__loading">Loading scenes...</div>}

      <div className="scene-dashboard__grid">
        {scenes.map((scene) => (
          <SceneCard key={scene.id} scene={scene} onDelete={handleDelete} />
        ))}

        <button
          className="scene-dashboard__new-card"
          onClick={() => {
            void navigate('/upload');
          }}
        >
          <span className="scene-dashboard__new-icon">+</span>
          <span className="scene-dashboard__new-label">New Scene</span>
          <span className="scene-dashboard__new-sub">
            Upload video to begin processing
          </span>
        </button>
      </div>
    </div>
  );
}
