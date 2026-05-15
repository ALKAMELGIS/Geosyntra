/**
 * Google Gemini API key: build-time env and/or vault mirror in localStorage (System Settings → API Tokens).
 * When the Node backend is reachable, keys persist in `agri_api_secrets.json` (or `AGRI_API_SECRETS_FILE`) and hydrate into the browser on load.
 */

export const GEMINI_API_KEY_LS_KEY = 'agri_gemini_api_key_v1'

const GEMINI_API_KEY_EVENT = 'agri-gemini-api-key-changed'

function envGeminiKey(): string {
  const raw = import.meta.env.VITE_GEMINI_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

/** Value mirrored in this browser; may have been synced from the server API vault. */
export function getGeminiApiKeyBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(GEMINI_API_KEY_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/** Effective key: saved browser value first, then VITE_GEMINI_API_KEY. */
export function getGeminiApiKey(): string {
  const fromLs = getGeminiApiKeyBrowserOverride()
  if (fromLs) return fromLs
  return envGeminiKey()
}

export function persistGeminiApiKeyInBrowser(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const k = key.trim()
  try {
    if (!k) window.localStorage.removeItem(GEMINI_API_KEY_LS_KEY)
    else window.localStorage.setItem(GEMINI_API_KEY_LS_KEY, k)
  } catch {
    console.warn('[gemini] Could not persist API key in localStorage')
  }
  window.dispatchEvent(new Event(GEMINI_API_KEY_EVENT))
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
