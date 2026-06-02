/**
 * Browser cache for custom API token slots — scoped per logged-in user.
 * Authoritative copy lives in SQLite (`user_api_tokens`) when the Node API is available.
 */

import { readCurrentUser } from './auth'

const LS_PREFIX = 'agri_user_api_token_v2_'

function keyForSlot(slotId: string): string {
  const user = readCurrentUser()
  const uid = user?.id != null ? String(user.id) : 'anon'
  return `${LS_PREFIX}${uid}_${slotId}`
}

export function getUserApiTokenValue(slotId: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(keyForSlot(slotId))
    return typeof raw === 'string' ? raw : ''
  } catch {
    return ''
  }
}

export function persistUserApiTokenValue(slotId: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const v = value.trim()
  try {
    if (!v) window.localStorage.removeItem(keyForSlot(slotId))
    else window.localStorage.setItem(keyForSlot(slotId), v)
  } catch {
    console.warn('[customUserApiTokens] Could not persist value')
  }
}

export function clearUserApiTokenValue(slotId: string): void {
  persistUserApiTokenValue(slotId, '')
}
