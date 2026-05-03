/**
 * Mapbox public token: browser override (System Settings) and/or build-time env.
 * Saved browser values take precedence so tokens survive redeploys and are not replaced
 * by CI build env unless the user clears the saved value.
 * Never commit real tokens — use VITE_MAPBOX_TOKEN or Admin → API Tokens (stored locally).
 */

export const MAPBOX_TOKEN_LS_KEY = 'agri_mapbox_access_token_v1'

const MAPBOX_TOKEN_EVENT = 'agri-mapbox-token-changed'

function envToken(): string {
  const raw = import.meta.env.VITE_MAPBOX_TOKEN
  return typeof raw === 'string' ? raw.trim() : ''
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
 * Effective token: non-empty browser override first, then VITE_MAPBOX_TOKEN.
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
