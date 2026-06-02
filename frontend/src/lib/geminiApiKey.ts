/**
 * Google Gemini API key — dev/localStorage only. Production uses `/api/gateway/gemini/*`.
 */

import { persistBuiltinBrowserOverride, readBuiltinBrowserOverride, readBuiltinEnvFallback } from './builtinTokenBrowserPolicy'

export const GEMINI_API_KEY_LS_KEY = 'agri_gemini_api_key_v1'

const GEMINI_API_KEY_EVENT = 'agri-gemini-api-key-changed'

function envGeminiKey(): string {
  const raw = import.meta.env.VITE_GEMINI_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

/** Value mirrored in this browser; may have been synced from the server API vault. */
function readLsGeminiKey(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(GEMINI_API_KEY_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function getGeminiApiKeyBrowserOverride(): string {
  return readBuiltinBrowserOverride(readLsGeminiKey)
}

/** Effective key: dev browser override or Vite env only (never used when API gateway is active). */
export function getGeminiApiKey(): string {
  const fromLs = getGeminiApiKeyBrowserOverride()
  if (fromLs) return fromLs
  return readBuiltinEnvFallback(envGeminiKey())
}

export function persistGeminiApiKeyInBrowser(key: string): void {
  persistBuiltinBrowserOverride((k) => {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      if (!k) window.localStorage.removeItem(GEMINI_API_KEY_LS_KEY)
      else window.localStorage.setItem(GEMINI_API_KEY_LS_KEY, k)
    } catch {
      console.warn('[gemini] Could not persist API key in localStorage')
    }
    window.dispatchEvent(new Event(GEMINI_API_KEY_EVENT))
  }, key.trim())
}

export function subscribeGeminiApiKey(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === GEMINI_API_KEY_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(GEMINI_API_KEY_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(GEMINI_API_KEY_EVENT, onCustom)
  }
}
