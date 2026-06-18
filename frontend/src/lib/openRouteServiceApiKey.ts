/**
 * OpenRouteService — production routes via `/api/gateway/openrouteservice/*`.
 * @see https://openrouteservice.org/dev/#/signup
 */

import { persistBuiltinBrowserOverride, readBuiltinBrowserOverride, readBuiltinEnvFallback } from './builtinTokenBrowserPolicy'
import { mustUseApiGateway, usePlatformTokenRuntime } from './platformTokenRuntime'

export const OPENROUTESERVICE_API_KEY_LS_KEY = 'agri_openrouteservice_api_key_v1'

const OPENROUTESERVICE_API_KEY_EVENT = 'agri-openrouteservice-api-key-changed'

function envOrsKey(): string {
  const raw =
    import.meta.env.VITE_OPENROUTESERVICE_API_KEY ??
    import.meta.env.VITE_ORS_API_KEY ??
    import.meta.env.VITE_OPENROUTE_SERVICE_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

function readLsOrsKey(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(OPENROUTESERVICE_API_KEY_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function getOpenRouteServiceApiKeyBrowserOverride(): string {
  return readBuiltinBrowserOverride(readLsOrsKey)
}

/** Gateway mode: empty string (server proxy). Dev: browser vault or Vite env. */
export function getOpenRouteServiceApiKey(): string {
  if (mustUseApiGateway()) {
    const configured = usePlatformTokenRuntime.getState().capabilities?.openrouteservice
    return configured ? '__gateway__' : ''
  }
  const fromLs = getOpenRouteServiceApiKeyBrowserOverride()
  if (fromLs) return fromLs
  return readBuiltinEnvFallback(envOrsKey())
}

export function persistOpenRouteServiceApiKeyInBrowser(key: string): void {
  persistBuiltinBrowserOverride((k) => {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      if (!k) window.localStorage.removeItem(OPENROUTESERVICE_API_KEY_LS_KEY)
      else window.localStorage.setItem(OPENROUTESERVICE_API_KEY_LS_KEY, k)
    } catch {
      console.warn('[openrouteservice] Could not persist API key in localStorage')
    }
    window.dispatchEvent(new Event(OPENROUTESERVICE_API_KEY_EVENT))
  }, key.trim())
}

export function subscribeOpenRouteServiceApiKey(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === OPENROUTESERVICE_API_KEY_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(OPENROUTESERVICE_API_KEY_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(OPENROUTESERVICE_API_KEY_EVENT, onCustom)
  }
}
