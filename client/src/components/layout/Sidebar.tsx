import { NavLink, useNavigate } from 'react-router-dom';
import { useScenes } from '../../hooks/useScenes.ts';
import type { PipelineStatus } from '../../types/pipeline.ts';
import './Sidebar.css';

function statusIcon(status?: PipelineStatus): string {
  switch (status) {
    case 'completed': return '\u2705';
    case 'running': return '\u{1F504}';
    case 'failed': return '\u274C';
    case 'warning': return '\u26A0\uFE0F';
    case 'blocked': return '\u{1F6D1}';
    case 'awaiting_confirmation':
    case 'awaiting_review': return '\u23F8\uFE0F';
    default: return '\u2B55';
  }
}

export function Sidebar() {
  const { scenes, loading } = useScenes();
  const navigate = useNavigate();

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
            <li key={scene.id}>
              <NavLink
                to={`/scene/${scene.id}/pipeline`}
                className={({ isActive }) =>
                  `sidebar__scene-link ${isActive ? 'sidebar__scene-link--active' : ''}`
                }
              >
                <span className="sidebar__scene-status">
                  {statusIcon()}
                </span>
                <span className="sidebar__scene-name">{scene.name}</span>
              </NavLink>
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
