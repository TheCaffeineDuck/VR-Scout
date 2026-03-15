import { NavLink, useNavigate } from 'react-router-dom';
import { useScenes } from '../../hooks/useScenes.ts';
import { deleteScene } from '../../api/client.ts';
import './Sidebar.css';

function statusClass(pipelineStatus: string | null): string {
  switch (pipelineStatus) {
    case 'completed':
    case 'awaiting_review':
      return 'sidebar__status-dot--green';
    case 'running':
    case 'awaiting_confirmation':
      return 'sidebar__status-dot--yellow';
    case 'failed':
    case 'blocked':
      return 'sidebar__status-dot--red';
    default:
      return 'sidebar__status-dot--gray';
  }
}

export function Sidebar() {
  const { scenes, loading, refresh } = useScenes();
  const navigate = useNavigate();

  const handleDelete = (e: React.MouseEvent, sceneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete scene "${sceneId}"?`)) return;
    void deleteScene(sceneId).then(() => {
      refresh();
      void navigate('/');
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__title">VR Scout Studio</h1>
      </div>

      <nav className="sidebar__nav">
        <div className="sidebar__section-label">Scenes</div>

        {loading && <div className="sidebar__loading">Loading...</div>}

        <ul className="sidebar__scene-list">
          {scenes.map((scene) => (
            <li key={scene.id} className="sidebar__scene-item">
              <NavLink
                to={`/scene/${scene.id}/pipeline`}
                className={({ isActive }) =>
                  `sidebar__scene-link ${isActive ? 'sidebar__scene-link--active' : ''}`
                }
              >
                <span
                  className={`sidebar__status-dot ${statusClass(scene.pipeline_status)}`}
                  title={scene.pipeline_status ?? 'No pipeline run'}
                />
                <span className="sidebar__scene-name">{scene.name}</span>
              </NavLink>
              <button
                className="sidebar__delete-btn"
                onClick={(e) => handleDelete(e, scene.id)}
                title="Delete scene"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>

        <button
          className="sidebar__new-scene-btn"
          onClick={() => {
            void navigate('/upload');
          }}
        >
          + New Scene
        </button>
      </nav>

      <div className="sidebar__footer">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `sidebar__settings-link ${isActive ? 'sidebar__settings-link--active' : ''}`
          }
        >
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
