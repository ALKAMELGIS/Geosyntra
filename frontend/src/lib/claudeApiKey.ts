/**
 * Anthropic Claude — production uses `/api/gateway/claude/*`.
 */

import { persistBuiltinBrowserOverride, readBuiltinBrowserOverride, readBuiltinEnvFallback } from './builtinTokenBrowserPolicy'

export const CLAUDE_API_KEY_LS_KEY = 'agri_claude_api_key_v1'

const CLAUDE_API_KEY_EVENT = 'agri-claude-api-key-changed'

function envClaudeKey(): string {
  const raw = import.meta.env.VITE_CLAUDE_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

function readLsClaudeKey(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(CLAUDE_API_KEY_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function getClaudeApiKeyBrowserOverride(): string {
  return readBuiltinBrowserOverride(readLsClaudeKey)
}

export function getClaudeApiKey(): string {
  const fromLs = getClaudeApiKeyBrowserOverride()
  if (fromLs) return fromLs
  return readBuiltinEnvFallback(envClaudeKey())
}

export function persistClaudeApiKeyInBrowser(key: string): void {
  persistBuiltinBrowserOverride((k) => {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      if (!k) window.localStorage.removeItem(CLAUDE_API_KEY_LS_KEY)
      else window.localStorage.setItem(CLAUDE_API_KEY_LS_KEY, k)
    } catch {
      console.warn('[claude] Could not persist API key in localStorage')
    }
    window.dispatchEvent(new Event(CLAUDE_API_KEY_EVENT))
  }, key.trim())
}

export function subscribeClaudeApiKey(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === CLAUDE_API_KEY_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(CLAUDE_API_KEY_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CLAUDE_API_KEY_EVENT, onCustom)
  }
}
