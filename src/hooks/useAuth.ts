import { useState, useEffect, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  signOut as fbSignOut,
  updateProfile,
  GoogleAuthProvider,
} from 'firebase/auth'
import { isFirebaseAvailable, auth } from '@/lib/firebase'
import { localGet, localSet, localId } from '@/lib/local-persistence'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  isAnonymous: boolean
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null
}

const LOCAL_USER_KEY = 'auth'
const LOCAL_USER_ID = 'current-user'

function getLocalUser(): AuthUser | null {
  return localGet<AuthUser>(LOCAL_USER_KEY, LOCAL_USER_ID)
}

function setLocalUser(user: AuthUser | null): void {
  if (user) {
    localSet(LOCAL_USER_KEY, LOCAL_USER_ID, user)
  } else {
    localStorage.removeItem('vr-scout:auth:current-user')
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (isFirebaseAvailable() && auth) {
      const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          setState({
            user: {
              uid: fbUser.uid,
              email: fbUser.email,
              displayName: fbUser.displayName,
              photoURL: fbUser.photoURL,
              isAnonymous: fbUser.isAnonymous,
            },
            loading: false,
            error: null,
          })
        } else {
          setState({ user: null, loading: false, error: null })
        }
      })
      return unsubscribe
    } else {
      // Local fallback — check for stored local user
      const localUser = getLocalUser()
      setState({ user: localUser, loading: false, error: null })
    }
  }, [])

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        if (isFirebaseAvailable() && auth) {
          const cred = await signInWithEmailAndPassword(auth, email, password)
          // onAuthStateChanged handles state update
          return cred.user
        } else {
          // Local fallback — create local user from email
          const user: AuthUser = {
            uid: localId(),
            email,
            displayName: email.split('@')[0],
            photoURL: null,
            isAnonymous: false,
          }
          setLocalUser(user)
          setState({ user, loading: false, error: null })
          return user
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sign in failed'
        setState((s) => ({ ...s, loading: false, error: message }))
        throw err
      }
    },
    []
  )

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        if (isFirebaseAvailable() && auth) {
          const cred = await createUserWithEmailAndPassword(
            auth,
            email,
            password
          )
          if (displayName) {
            await updateProfile(cred.user, { displayName })
          }
          return cred.user
        } else {
          const user: AuthUser = {
            uid: localId(),
            email,
            displayName: displayName || email.split('@')[0],
            photoURL: null,
            isAnonymous: false,
          }
          setLocalUser(user)
          setState({ user, loading: false, error: null })
          return user
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sign up failed'
        setState((s) => ({ ...s, loading: false, error: message }))
        throw err
      }
    },
    []
  )

  const signInWithGoogle = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      if (isFirebaseAvailable() && auth) {
        const provider = new GoogleAuthProvider()
        const cred = await signInWithPopup(auth, provider)
        return cred.user
      } else {
        // Local fallback — mock Google sign-in
        const user: AuthUser = {
          uid: localId(),
          email: 'local-user@vr-scout.dev',
          displayName: 'Local User',
          photoURL: null,
          isAnonymous: false,
        }
        setLocalUser(user)
        setState({ user, loading: false, error: null })
        return user
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Google sign in failed'
      setState((s) => ({ ...s, loading: false, error: message }))
      throw err
    }
  }, [])

  const signInAsGuest = useCallback(async (displayName: string) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      if (isFirebaseAvailable() && auth) {
        const cred = await signInAnonymously(auth)
        if (displayName) {
          await updateProfile(cred.user, { displayName })
        }
        return cred.user
      } else {
        const user: AuthUser = {
          uid: localId(),
          email: null,
          displayName: displayName || 'Guest',
          photoURL: null,
          isAnonymous: true,
        }
        setLocalUser(user)
        setState({ user, loading: false, error: null })
        return user
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Guest sign in failed'
      setState((s) => ({ ...s, loading: false, error: message }))
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      if (isFirebaseAvailable() && auth) {
        await fbSignOut(auth)
      }
      setLocalUser(null)
      setState({ user: null, loading: false, error: null })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign out failed'
      setState((s) => ({ ...s, error: message }))
    }
  }, [])

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInAsGuest,
    signOut,
    clearError,
  }
}
