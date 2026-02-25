import { createContext, useContext } from 'react'
import type { AuthUser } from '@/hooks/useAuth'

interface AuthContextValue {
  user: AuthUser
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuthContext must be used within an authenticated AuthGate')
  }
  return ctx
}
