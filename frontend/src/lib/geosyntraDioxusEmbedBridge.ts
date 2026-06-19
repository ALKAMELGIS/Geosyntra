/**
 * React child — accept auth session from Dioxus parent iframe host (Task 30).
 */
import { startSession } from './auth'
import type { CurrentUser } from './authTypes'
import { normalizeRole } from './authTypes'

export const GEOSYNTRA_EMBED_AUTH_EVENT = 'geosyntra-embed-auth'

const ALLOWED_PARENT_ORIGINS = new Set([
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'https://www.geosyntra.org',
  'https://geosyntra.org',
])

type DioxusAuthPayload = {
  access_token?: string | null
  refresh_token?: string | null
  email?: string | null
  name?: string | null
  role?: string | null
  role_slug?: string | null
  status?: string | null
  tenant_id?: string | null
  permissions?: string[]
}

function isAllowedParentOrigin(origin: string): boolean {
  if (!origin) return false
  if (ALLOWED_PARENT_ORIGINS.has(origin)) return true
  try {
    const host = new URL(origin).hostname
    return host === '127.0.0.1' || host === 'localhost' || host.endsWith('.geosyntra.org')
  } catch {
    return false
  }
}

function userFromDioxusSession(session: DioxusAuthPayload): CurrentUser | null {
  const email = String(session.email ?? '').trim()
  if (!email) return null
  return {
    id: Date.now(),
    name: String(session.name ?? email),
    email,
    role: session.role ? normalizeRole(session.role) : 'User',
    roleSlug: session.role_slug ?? undefined,
    status: session.status ?? undefined,
    permissions: Array.isArray(session.permissions) ? session.permissions : undefined,
  }
}

export function isDioxusGisEmbed(): boolean {
  if (typeof window === 'undefined') return false
  if (window.self !== window.top) return true
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('embed') === '1') return true
    const hash = window.location.hash || ''
    const q = hash.indexOf('?')
    if (q >= 0) {
      const hashParams = new URLSearchParams(hash.slice(q + 1))
      if (hashParams.get('embed') === '1') return true
    }
  } catch {
    //
  }
  return false
}

export function installGeosyntraDioxusEmbedBridge(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('message', (event) => {
    if (!isAllowedParentOrigin(event.origin)) return
    const data = event.data as { type?: string; session?: DioxusAuthPayload } | null
    if (!data || data.type !== 'geosyntra:auth-session' || !data.session) return
    const token = data.session.access_token?.trim()
    if (!token) return
    const user = userFromDioxusSession(data.session)
    if (!user) return
    startSession(user, { persist: true, accessToken: token })
    window.dispatchEvent(new CustomEvent(GEOSYNTRA_EMBED_AUTH_EVENT, { detail: { email: user.email } }))
  })
}
