import { Component } from 'react'
import { HashRouter, Navigate, useLocation } from 'react-router-dom'
import { AppDialogProvider } from './components/AppDialogProvider'
import HeaderBar from './components/HeaderBar'
import NavMenu from './components/NavMenu'
import AppRoutes from './routes/AppRoutes'
import { AuthProvider, useAuth } from './state/auth'
import { LanguageProvider } from './lib/i18n'
import { SystemSettingsProvider } from './store/SystemSettingsContext'

type AppErrorState = {
  error: unknown
  kind: 'render'
  details?: string
} | null

/**
 * React error boundary only — no global `window` listeners.
 * Listening to `unhandledrejection` / `error` was turning CDN, ad-block, and flaky
 * network failures (often "Failed to fetch") into a full-screen fatal state unrelated
 * to app logic. Third-party runtimes (maps, Spline, particles) must not own the shell.
 */
class AppErrorBoundary extends Component<{ children: JSX.Element }, { err: AppErrorState }> {
  state: { err: AppErrorState } = { err: null }

  static getDerivedStateFromError(error: unknown) {
    const details = error instanceof Error && typeof error.stack === 'string' ? error.stack : undefined
    return { err: { error, kind: 'render' as const, details } }
  }

  componentDidCatch(error: unknown) {
    try {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[AppErrorBoundary]', message, error)
    } catch {
    }
  }

  render() {
    if (!this.state.err) return this.props.children

    const message =
      this.state.err.error instanceof Error
        ? this.state.err.error.message
        : typeof this.state.err.error === 'string'
          ? this.state.err.error
          : 'A runtime error prevented the page from loading.'

    const reset = async () => {
      try {
        localStorage.clear()
      } catch {
      }
      try {
        sessionStorage.clear()
      } catch {
      }
      try {
        if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('GisMapStore')
      } catch {
      }
      try {
        if (typeof window !== 'undefined' && 'caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
      } catch {
      }
      try {
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map((r) => r.unregister()))
        }
      } catch {
      }
      window.location.reload()
    }

    return (
      <div className="geosyntra-app-error">
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>حدث خطأ ومنع الصفحة من التحميل</div>
        <div style={{ marginBottom: 12, color: 'var(--ds-color-text-muted)' }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" className="gis-btn" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            type="button"
            className="gis-btn"
            onClick={() => {
              void reset()
            }}
          >
            Reset App Storage
          </button>
        </div>
        {this.state.err.details ? (
          <pre style={{ padding: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{this.state.err.details}</pre>
        ) : null}
      </div>
    )
  }
}

function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const handleLogout = () => {
    logout()
  }

  const isOnLogin = location.pathname === '/login'
  /**
   * Home (`/`) renders the upstream 21st.dev "Explore Our World" 3D ScrollGlobe
   * landing page. The reference bundle takes over the entire viewport — no
   * header, no side rail, no chrome — and the section navigation lives inside
   * the landing component itself. Wrapping it in the app shell would compress
   * the globe + sections inside the inner scroll area and break the 1:1
   * design. We therefore drop chrome on the home route and let the landing
   * page own the document scroll, matching the upstream demo byte-for-byte.
   * Once the visitor hits a hero CTA they're routed into a real platform
   * surface (Satellite Indices / GIS Map) where the chrome reappears.
   */
  const isOnHome = location.pathname === '/' || location.pathname === ''
  const showChrome = !!user && !isOnLogin && !isOnHome
  /** Fertigation records is the only remaining `/data/*` route — keep its tight layout class. */
  const isOperationsDataPage = location.pathname.startsWith('/data/')
  const mainContentClass = [
    'content',
    isOperationsDataPage && 'content--operations-fit',
    isOnHome && 'content--landing-fullbleed',
  ]
    .filter(Boolean)
    .join(' ')

  const layoutChromeClass = ['layout', 'layout-sidebar', 'app-layout'].join(' ')
  const layoutShellClass = isOnHome ? 'layout layout--landing-fullbleed' : showChrome ? layoutChromeClass : 'layout'

  if (user && isOnLogin) {
    const from = (location.state as any)?.from?.pathname
    return <Navigate to={typeof from === 'string' && from ? from : '/'} replace />
  }

  if (!user && !isOnLogin) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <>
      {showChrome ? <HeaderBar /> : null}
      <div className={layoutShellClass}>
        {showChrome ? <NavMenu onLogout={handleLogout} /> : null}
        <main className={mainContentClass}>
          <AppRoutes />
        </main>
      </div>
    </>
  )
}

export default function App() {
  return (
    <HashRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <LanguageProvider>
        <AuthProvider>
          <SystemSettingsProvider>
            <AppDialogProvider>
              <AppErrorBoundary>
                <AppShell />
              </AppErrorBoundary>
            </AppDialogProvider>
          </SystemSettingsProvider>
        </AuthProvider>
      </LanguageProvider>
    </HashRouter>
  )
}
