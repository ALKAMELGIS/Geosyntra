/**
 * Mapbox — Hostinger MAPBOX_TOKEN env via public /api/config/mapbox + backend proxy.
 * Never localStorage, API Manager, or session auth.
 * Local dev (localhost): VITE_MAPBOX_TOKEN used until backend session reports configured.
 */
import { mustUseApiGateway } from './platformTokenRuntime'
import {
  clearMapboxSessionPublicToken,
  getMapboxSessionPublicToken,
  getMapboxSessionSnapshot,
  initializeMapbox,
  isMapboxSessionConfigured,
  isMapboxProxyMode,
  resolveMapboxGlProxyInitToken,
  subscribeMapboxSession,
} from './mapboxSessionToken'

const MAPBOX_TOKEN_EVENT = 'agri-mapbox-token-changed'

export function isPublicMapboxToken(token: string): boolean {
  return String(token || '').trim().startsWith('pk.')
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1'
}

function readViteMapboxEnvToken(): string {
  // Vite inlines import.meta.env at build time — never bake dev pk.* into production bundles.
  if (import.meta.env.PROD) return ''
  const a = import.meta.env.VITE_MAPBOX_TOKEN
  const fromA = typeof a === 'string' ? a.trim() : ''
  if (fromA) return fromA
  const b = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  return typeof b === 'string' ? b.trim() : ''
}

/** Vite env token — allowed on localhost even in gateway mode; never in production hosting. */
export function getLocalDevMapboxToken(): string {
  if (!isLocalDevHost()) return ''
  return readViteMapboxEnvToken()
}

/** Dev-only Vite env — ignored in production gateway mode (except localhost). */
export function getMapboxAccessTokenFromEnv(): string {
  if (mustUseApiGateway() && !isLocalDevHost()) return ''
  return readViteMapboxEnvToken()
}

export function isMapboxGlInitPlaceholder(token: string): boolean {
  return String(token || '').trim() === resolveMapboxGlProxyInitToken()
}

/** Route Mapbox HTTP through public backend proxy (production / configured session only). */
export function shouldProxyMapboxRequests(): boolean {
  return mustUseApiGateway() && isMapboxSessionConfigured()
}

/** Platform pk.* from API session or dev Vite env — empty when only Esri/OSM fallbacks apply. */
export function getPlatformMapboxAccessToken(): string {
  if (mustUseApiGateway()) {
    const fromSession = getMapboxSessionPublicToken()
    if (fromSession && isPublicMapboxToken(fromSession) && !isMapboxGlInitPlaceholder(fromSession)) {
      return fromSession
    }
    return getLocalDevMapboxToken()
  }
  return getMapboxAccessTokenFromEnv()
}

/** Token for Mapbox GL init — API pk.* when available; else dev Vite env; else raster-safe placeholder. */
export function getMapboxAccessToken(): string {
  if (mustUseApiGateway()) {
    const fromSession = getMapboxSessionPublicToken()
    if (fromSession) return fromSession
    const local = getLocalDevMapboxToken()
    if (local) return local
    return resolveMapboxGlProxyInitToken()
  }
  const fromEnv = getMapboxAccessTokenFromEnv()
  if (fromEnv) return fromEnv
  return resolveMapboxGlProxyInitToken()
}

/** @deprecated Mapbox is env-only — no browser persistence. */
export function persistMapboxAccessTokenInBrowser(_token: string): void {}

/** @deprecated Mapbox is env-only — no browser persistence. */
export function getMapboxAccessTokenBrowserOverride(): string {
  return ''
}

/** @deprecated Use initializeMapbox at app startup. */
export function bootstrapMapboxAccessTokenPersistence(): void {
  if (typeof window === 'undefined' || !mustUseApiGateway()) return
  void initializeMapbox()
}

export {
  clearMapboxSessionPublicToken,
  initializeMapbox,
  hydrateMapboxSessionFromServer,
  hydrateMapboxSessionFromGateway,
  isMapboxSessionConfigured,
  isMapboxProxyMode,
  getMapboxSessionSnapshot,
  subscribeMapboxSession,
  resolveMapboxGlProxyInitToken,
} from './mapboxSessionToken'

export function subscribeMapboxAccessToken(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onCustom = () => listener()
  const unsubSession = subscribeMapboxSession(listener)
  window.addEventListener(MAPBOX_TOKEN_EVENT, onCustom)
  window.addEventListener('geosyntra-platform-tokens-synced', onCustom)
  return () => {
    unsubSession()
    window.removeEventListener(MAPBOX_TOKEN_EVENT, onCustom)
    window.removeEventListener('geosyntra-platform-tokens-synced', onCustom)
  }
}