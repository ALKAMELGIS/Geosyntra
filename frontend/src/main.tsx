import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import './geodash-tailwind.css'
import './styles/landing-shadcn-vars.css'
import './styles/design-tokens.css'
import './styles/app-design-system.css'
import './styles/dark-mode-unified.css'
import './styles/si-scrollbar-system.css'
import './styles/responsive-shell.css'
/* Imported AFTER every other top-level stylesheet so the
 * `html[data-theme="light"] …` overrides win on source order alone, even
 * though their attribute-selector specificity already beats the dark base
 * rules. Keeps the white-glass identity contained in one reviewable file. */
import './styles/light-glass-theme.css'
import { bootstrapMapboxAccessTokenPersistence } from './lib/mapboxAccessToken'
import { redirectLegacySaasRoutes } from './lib/legacyRouteRedirect'

const legacyRedirecting = typeof window !== 'undefined' && redirectLegacySaasRoutes()

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

if (!legacyRedirecting && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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

if (!legacyRedirecting) {
  bootstrapMapboxAccessTokenPersistence()

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
