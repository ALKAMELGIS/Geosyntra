import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import './styles/theme-tokens.css'
import './styles/lux-popup-system.css'
import './styles/map-popup-theme.css'
import './geodash-tailwind.css'
import './styles/landing-shadcn-vars.css'
import './styles/design-tokens.css'
import './styles/app-design-system.css'
import './styles/dark-mode-unified.css'
import './styles/si-scrollbar-system.css'
import './styles/responsive-shell.css'
/* White-glass identity + token flips for html[data-theme="light"] */
import './styles/light-glass-theme.css'
/* Glass panels — respects theme tokens (white glass in lite, black glass in dark) */
import './styles/gs-panel-glass-system.css'
import { initializeMapbox } from './lib/mapboxAccessToken'
import { installMapboxWorkerErrorGuard } from './lib/mapboxWorkerErrorGuard'
import { mustUseApiGateway } from './lib/platformTokenRuntime'
import { loadSystemSettings } from './services/settingsStorage'
import { applyThemeToDocument } from './store/SystemSettingsContext'
import { applyMapPopupThemeToDocument, readMapPopupTheme } from './lib/mapPopupTheme'
import { redirectLegacySaasRoutes } from './lib/legacyRouteRedirect'
import { ensureStaticPlatformOwnerSync } from './lib/onboarding/staticOwnerBootstrap'

if (typeof window !== 'undefined') {
  installMapboxWorkerErrorGuard()
  redirectLegacySaasRoutes()
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

const safeSessionGetItem = (key: string) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSessionSetItem = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value)
  } catch {
  }
}

const safeSessionRemoveItem = (key: string) => {
  try {
    sessionStorage.removeItem(key)
  } catch {
  }
}

if (!isLocalDevHost() && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const resetKey = 'sw_reset_v3'
  const canReload = typeof sessionStorage !== 'undefined' && !safeSessionGetItem(resetKey)
  const hadController = Boolean(navigator.serviceWorker.controller)

  const unregisterPromise =
    typeof navigator.serviceWorker.getRegistrations === 'function'
      ? navigator.serviceWorker
          .getRegistrations()
          .then(regs => {
            const hasAny = regs.length > 0
            return Promise.all(regs.map(r => r.unregister())).then(() => hasAny)
          })
          .catch(() => false)
      : Promise.resolve(false)

  const clearCachePromise =
    typeof window !== 'undefined' && 'caches' in window
      ? caches
          .keys()
          .then(keys => Promise.all(keys.map(k => caches.delete(k))))
          .then(() => true)
          .catch(() => false)
      : Promise.resolve(false)

  Promise.all([unregisterPromise, clearCachePromise]).then(([hadRegs]) => {
    if (canReload && (hadRegs || hadController)) {
      safeSessionSetItem(resetKey, '1')
      if (redirectLegacySaasRoutes()) return
      window.location.reload()
      return
    }
    if (typeof sessionStorage !== 'undefined') safeSessionRemoveItem(resetKey)
  })
}

if (typeof document !== 'undefined') {
  applyThemeToDocument(loadSystemSettings())
  applyMapPopupThemeToDocument(readMapPopupTheme())
  ensureStaticPlatformOwnerSync()

  const rootEl = document.getElementById('root')
  const mountApp = () => {
    if (!rootEl) return
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  }

  // Mount the SPA immediately. Never gate the React tree behind the Mapbox
  // config fetch: if the backend API gateway is unreachable/hanging, awaiting
  // initializeMapbox() here would leave #root empty forever (black screen).
  // Mapbox initializes in the background and map surfaces subscribe to the
  // session, so the token is applied as soon as it arrives.
  mountApp()
  void initializeMapbox()
}
