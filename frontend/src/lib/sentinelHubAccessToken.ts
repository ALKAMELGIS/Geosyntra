/**
 * Sentinel Hub access token — production: in-memory runtime from `/api/gateway/sentinel/credentials`.
 */

import { readBuiltinBrowserOverride, readBuiltinEnvFallback, persistBuiltinBrowserOverride } from './builtinTokenBrowserPolicy'
import { mustUseApiGateway, usePlatformTokenRuntime } from './platformTokenRuntime'

export const SENTINEL_HUB_ACCESS_TOKEN_LS_KEY = 'agri_sentinel_hub_access_token_v1'

const SENTINEL_HUB_ACCESS_TOKEN_EVENT = 'agri-sentinel-hub-access-token-changed'

function envToken(): string {
  const raw = import.meta.env.VITE_SENTINEL_HUB_ACCESS_TOKEN
  return typeof raw === 'string' ? raw.trim() : ''
}

function readLsSentinelToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(SENTINEL_HUB_ACCESS_TOKEN_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function getSentinelHubAccessTokenBrowserOverride(): string {
  return readBuiltinBrowserOverride(readLsSentinelToken)
}

/** Effective token: gateway runtime (session) → dev localStorage → Vite env. */
export function getSentinelHubAccessToken(): string {
  if (mustUseApiGateway()) {
    const runtime = usePlatformTokenRuntime.getState().sentinelAccessToken
    return typeof runtime === 'string' ? runtime.trim() : ''
  }
  const fromLs = getSentinelHubAccessTokenBrowserOverride()
  if (fromLs) return fromLs
  return readBuiltinEnvFallback(envToken())
}

export function persistSentinelHubAccessTokenInBrowser(token: string): void {
  persistBuiltinBrowserOverride((t) => {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      if (!t) window.localStorage.removeItem(SENTINEL_HUB_ACCESS_TOKEN_LS_KEY)
      else window.localStorage.setItem(SENTINEL_HUB_ACCESS_TOKEN_LS_KEY, t)
    } catch {
      console.warn('[sentinel-hub] Could not persist access token in localStorage')
    }
    window.dispatchEvent(new Event(SENTINEL_HUB_ACCESS_TOKEN_EVENT))
  }, token.trim())
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
