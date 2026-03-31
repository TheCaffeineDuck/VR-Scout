import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface MainLayoutProps {
  children: ReactNode;
}

/** Main application layout with sidebar and content area */
export function MainLayout({ children }: MainLayoutProps): React.JSX.Element {
  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
