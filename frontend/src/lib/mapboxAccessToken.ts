/**
 * Mapbox public token: browser (System Settings + hydration from server) and/or build-time env.
 * Non-empty browser/localStorage value wins over env so keys saved via API Tokens survive
 * redeploys; clear the saved token to fall back to VITE_MAPBOX_TOKEN / VITE_MAPBOX_ACCESS_TOKEN.
 * Never commit real tokens — use .env (Vite) or Admin → API Tokens (server file when API runs).
 */

export const MAPBOX_TOKEN_LS_KEY = 'agri_mapbox_access_token_v1'

const MAPBOX_TOKEN_EVENT = 'agri-mapbox-token-changed'

/** Build-time token: canonical `VITE_MAPBOX_TOKEN` or alias `VITE_MAPBOX_ACCESS_TOKEN` (Create-React-App style name). */
export function getMapboxAccessTokenFromEnv(): string {
  const a = import.meta.env.VITE_MAPBOX_TOKEN
  const fromA = typeof a === 'string' ? a.trim() : ''
  if (fromA) return fromA
  const b = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  const fromB = typeof b === 'string' ? b.trim() : ''
  return fromB
}

function envToken(): string {
  return getMapboxAccessTokenFromEnv()
}

/** Token saved only in this browser (System Settings → Maps). */
export function getMapboxAccessTokenBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(MAPBOX_TOKEN_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/**
 * Effective token: non-empty browser override first, then build-time env (see {@link getMapboxAccessTokenFromEnv}).
 */
export function getMapboxAccessToken(): string {
  const fromLs = getMapboxAccessTokenBrowserOverride()
  if (fromLs) return fromLs
  return envToken()
}

export function persistMapboxAccessTokenInBrowser(token: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const t = token.trim()
  try {
    if (!t) window.localStorage.removeItem(MAPBOX_TOKEN_LS_KEY)
    else window.localStorage.setItem(MAPBOX_TOKEN_LS_KEY, t)
  } catch {
    console.warn('[mapbox] Could not persist token in localStorage')
  }
  window.dispatchEvent(new Event(MAPBOX_TOKEN_EVENT))
}

export function subscribeMapboxAccessToken(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === MAPBOX_TOKEN_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(MAPBOX_TOKEN_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(MAPBOX_TOKEN_EVENT, onCustom)
  }
}
