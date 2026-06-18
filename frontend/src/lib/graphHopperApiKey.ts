/**
 * GraphHopper — production routes via `/api/gateway/graphhopper/*`.
 * @see https://www.graphhopper.com/
 */

import { persistBuiltinBrowserOverride, readBuiltinBrowserOverride, readBuiltinEnvFallback } from './builtinTokenBrowserPolicy'
import { mustUseApiGateway, usePlatformTokenRuntime } from './platformTokenRuntime'

export const GRAPHHOPPER_API_KEY_LS_KEY = 'agri_graphhopper_api_key_v1'

const GRAPHHOPPER_API_KEY_EVENT = 'agri-graphhopper-api-key-changed'

function envGraphHopperKey(): string {
  const raw =
    import.meta.env.VITE_GRAPHHOPPER_API_KEY ??
    import.meta.env.VITE_GRAPHOPPER_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

function readLsGraphHopperKey(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(GRAPHHOPPER_API_KEY_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function getGraphHopperApiKeyBrowserOverride(): string {
  return readBuiltinBrowserOverride(readLsGraphHopperKey)
}

export function getGraphHopperApiKey(): string {
  if (mustUseApiGateway()) {
    const configured = usePlatformTokenRuntime.getState().capabilities?.graphhopper
    return configured ? '__gateway__' : ''
  }
  const fromLs = getGraphHopperApiKeyBrowserOverride()
  if (fromLs) return fromLs
  return readBuiltinEnvFallback(envGraphHopperKey())
}

export function persistGraphHopperApiKeyInBrowser(key: string): void {
  persistBuiltinBrowserOverride((k) => {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      if (!k) window.localStorage.removeItem(GRAPHHOPPER_API_KEY_LS_KEY)
      else window.localStorage.setItem(GRAPHHOPPER_API_KEY_LS_KEY, k)
    } catch {
      console.warn('[graphhopper] Could not persist API key in localStorage')
    }
    window.dispatchEvent(new Event(GRAPHHOPPER_API_KEY_EVENT))
  }, key.trim())
}

export function subscribeGraphHopperApiKey(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === GRAPHHOPPER_API_KEY_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(GRAPHHOPPER_API_KEY_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(GRAPHHOPPER_API_KEY_EVENT, onCustom)
  }
}
