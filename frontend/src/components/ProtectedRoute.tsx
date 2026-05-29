import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../state/auth'
import { SAAS_ROUTES } from '../lib/saasRoutes'
import './auth/oauth-glass.css'

type ProtectedRouteProps = {
  children: React.ReactNode
}

/** Redirect unauthenticated users to the home sign-in wizard. */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, sessionReady } = useAuth()
  const location = useLocation()

  if (!sessionReady) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(248,250,252,0.7)' }}>
        <span className="oauth-glass-btn__spinner" aria-hidden />
        <p style={{ marginTop: '0.75rem' }}>Checking session…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={SAAS_ROUTES.authLogin} replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
