import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: ReactNode;
}

/** Main application layout with sidebar and content area */
export function MainLayout({ children }: MainLayoutProps): React.JSX.Element {
  // TODO: Implement responsive layout with sidebar toggle
  return (
    <div className="main-layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
