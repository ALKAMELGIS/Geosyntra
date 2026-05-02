/**
 * Sentinel Hub access token (OAuth / Process API style): build-time env and/or browser override.
 * Stored in System Settings → API Tokens. Use when integrating authenticated Sentinel Hub REST calls.
 */

export const SENTINEL_HUB_ACCESS_TOKEN_LS_KEY = 'agri_sentinel_hub_access_token_v1'

const SENTINEL_HUB_ACCESS_TOKEN_EVENT = 'agri-sentinel-hub-access-token-changed'

function envToken(): string {
  const raw = import.meta.env.VITE_SENTINEL_HUB_ACCESS_TOKEN
  return typeof raw === 'string' ? raw.trim() : ''
}

export function getSentinelHubAccessTokenBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(SENTINEL_HUB_ACCESS_TOKEN_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/** Effective token: VITE_SENTINEL_HUB_ACCESS_TOKEN first, then localStorage. */
export function getSentinelHubAccessToken(): string {
  const fromEnv = envToken()
  if (fromEnv) return fromEnv
  return getSentinelHubAccessTokenBrowserOverride()
}

export function persistSentinelHubAccessTokenInBrowser(token: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const t = token.trim()
  try {
    if (!t) window.localStorage.removeItem(SENTINEL_HUB_ACCESS_TOKEN_LS_KEY)
    else window.localStorage.setItem(SENTINEL_HUB_ACCESS_TOKEN_LS_KEY, t)
  } catch {
    console.warn('[sentinel-hub] Could not persist access token in localStorage')
  }
  window.dispatchEvent(new Event(SENTINEL_HUB_ACCESS_TOKEN_EVENT))
}

export function subscribeSentinelHubAccessToken(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === SENTINEL_HUB_ACCESS_TOKEN_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(SENTINEL_HUB_ACCESS_TOKEN_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(SENTINEL_HUB_ACCESS_TOKEN_EVENT, onCustom)
  }
}
