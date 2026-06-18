import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { readCurrentUser, startSession } from '../lib/auth'
import type { CurrentUser } from '../lib/auth'
import { apiLogout, validateServerSession } from '../lib/authSession'
import { resetUserTokenSessionSync, syncUserApiTokensForSession } from '../lib/userTokenSessionSync'
import { startPlatformTokenRealtimeSync, stopPlatformTokenRealtimeSync } from '../lib/tokenSyncRealtime'

type AuthContextValue = {
  user: CurrentUser | null
  sessionReady: boolean
  login: (user: Partial<CurrentUser>) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(() => readCurrentUser())
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void validateServerSession().then(next => {
      if (cancelled) return
      setUser(next)
      setSessionReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const refresh = () => setUser(readCurrentUser())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  useEffect(() => {
    if (!sessionReady || !user) return
    void syncUserApiTokensForSession({ force: true })
    startPlatformTokenRealtimeSync()
    return () => stopPlatformTokenRealtimeSync()
  }, [sessionReady, user?.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      sessionReady,
      login: next => {
        // Session envelope is written by homeSignIn / OAuth with the user's persist choice.
        setUser(readCurrentUser() ?? (next as CurrentUser))
        void syncUserApiTokensForSession({ force: true })
      },
      logout: () => {
        resetUserTokenSessionSync()
        void apiLogout().then(() => setUser(null))
      },
    }),
    [user, sessionReady]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>.')
  return ctx
}

