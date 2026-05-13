import { Component, useEffect } from 'react'
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
  kind: 'render' | 'window'
  details?: string
} | null

class AppErrorBoundary extends Component<{ children: JSX.Element }, { err: AppErrorState }> {
  state: { err: AppErrorState } = { err: null }
  private onUnhandledRejection?: (e: PromiseRejectionEvent) => void
  private onErrorEvent?: (e: ErrorEvent) => void

  static getDerivedStateFromError(error: unknown) {
    return { err: { error, kind: 'render' as const } }
  }

  componentDidCatch(error: unknown) {
    try {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[AppErrorBoundary]', message, error)
    } catch {
    }
  }

  componentDidMount() {
    if (typeof window === 'undefined') return
    this.onUnhandledRejection = (e) => {
      const reason = (e as any).reason
      const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
      if (msg.includes('Style is not done loading')) return
      const details = reason instanceof Error ? reason.stack : undefined
      this.setState({ err: { error: reason ?? e, kind: 'window', details } })
      try {
        console.error('[unhandledrejection]', reason)
      } catch {
      }
    }
    this.onErrorEvent = (e) => {
      const err = e?.error
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : String(e?.message ?? '')
      if (msg.includes('Style is not done loading')) return
      const details = typeof e?.error?.stack === 'string' ? e.error.stack : undefined
      this.setState({ err: { error: e.error ?? e.message, kind: 'window', details } })
      try {
        console.error('[window.error]', e.error ?? e.message)
      } catch {
      }
    }
    window.addEventListener('unhandledrejection', this.onUnhandledRejection)
    window.addEventListener('error', this.onErrorEvent)
  }

  componentWillUnmount() {
    if (typeof window === 'undefined') return
    if (this.onUnhandledRejection) window.removeEventListener('unhandledrejection', this.onUnhandledRejection)
    if (this.onErrorEvent) window.removeEventListener('error', this.onErrorEvent)
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
  const showChrome = !!user && !isOnLogin
  /** Fertigation records is the only remaining `/data/*` route — keep its tight layout class. */
  const isOperationsDataPage = location.pathname.startsWith('/data/')
  const mainContentClass = [
    'content',
    isOperationsDataPage && 'content--operations-fit',
  ]
    .filter(Boolean)
    .join(' ')

  const layoutChromeClass = ['layout', 'layout-sidebar', 'app-layout'].join(' ')

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
      <div className={showChrome ? layoutChromeClass : 'layout'}>
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
