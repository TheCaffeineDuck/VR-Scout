import { useState } from 'react'
import { useAuthContext } from '@/hooks/useAuthContext'

export function UserMenu() {
  const { user, signOut } = useAuthContext()
  const [open, setOpen] = useState(false)

  const initials = (user.displayName || user.email || 'U')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center hover:bg-indigo-500 transition-colors"
        title={user.displayName || user.email || 'User'}
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-56 py-2">
            <div className="px-3 py-2 border-b border-gray-700">
              <p className="text-sm text-white font-medium truncate">
                {user.displayName || 'User'}
              </p>
              {user.email && (
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              )}
              {user.isAnonymous && (
                <p className="text-xs text-amber-400">Guest</p>
              )}
            </div>
            <button
              onClick={async () => {
                setOpen(false)
                await signOut()
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
