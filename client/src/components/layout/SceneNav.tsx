import { NavLink, useParams } from 'react-router-dom';
import './SceneNav.css';

const TABS = [
  { label: 'Upload', path: 'upload' },
  { label: 'Pipeline', path: 'pipeline' },
  { label: 'Review', path: 'review' },
] as const;

export function SceneNav() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;

  return (
    <nav className="scene-nav">
      {TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={`/scene/${id}/${tab.path}`}
          className={({ isActive }) =>
            `scene-nav__tab ${isActive ? 'scene-nav__tab--active' : ''}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
