import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/hooks/useAuthContext'
import { isAdmin } from '@/lib/admin'

export function AdminLayout() {
  const { user } = useAuthContext()
  const navigate = useNavigate()

  if (!isAdmin(user.email)) {
    // In production, redirect away
    if (!import.meta.env.DEV) {
      navigate('/', { replace: true })
      return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-bold tracking-wide text-gray-300 uppercase">
            VR Scout Admin
          </h2>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <SidebarLink to="/admin/properties">Properties</SidebarLink>
          <SidebarLink to="/admin/analytics">Analytics</SidebarLink>
        </nav>
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={() => navigate('/')}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            &larr; Back to Viewer
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-12 bg-gray-900/50 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
          <span className="text-sm font-medium text-gray-400">
            VR Scout Admin
          </span>
          <span className="text-xs text-gray-500 truncate ml-4">
            {user.displayName || user.email || 'Admin'}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block px-3 py-2 rounded text-sm transition-colors ${
          isActive
            ? 'bg-blue-600/20 text-blue-400'
            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
