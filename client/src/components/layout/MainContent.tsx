import { Outlet } from 'react-router-dom';
import './MainContent.css';

export function MainContent() {
  return (
    <main className="main-content">
      <Outlet />
    </main>
  );
}
