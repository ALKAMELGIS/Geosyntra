import { normalizeEmail, normalizeRole, readAccessToken, readCurrentUser, isSessionPersisted, startSession, type CurrentUser } from './auth'
import { isWorkspaceApiConfigured, workspaceFetch } from './apiClient'
import type { PublicAuthUser } from './onboarding/authApi'
import { clearBuiltinTokenBrowserOverrides } from './clearBuiltinTokenOverrides'
import { resetUserTokenSessionSync } from './userTokenSessionSync'
import { isDioxusGisEmbed } from './geosyntraDioxusEmbedBridge'

type JwtPayload = { exp?: number; sub?: string }

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

export function isAccessTokenExpired(token: string | null): boolean {
  if (!token) return true
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return false
  return payload.exp * 1000 <= Date.now()
}

function publicUserToCurrent(user: PublicAuthUser): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: normalizeEmail(user.email),
    role: normalizeRole(user.role),
    roleSlug: user.roleSlug,
    status: user.status,
    permissions: user.permissions,
  }
}

/**
 * Validates stored JWT against the backend user directory.
 * Clears stale local sessions when the token is missing, expired, or rejected.
 */
export async function validateServerSession(): Promise<CurrentUser | null> {
  const local = readCurrentUser()
  const token = readAccessToken()

  // Dioxus iframe host pushes JWT via postMessage — do not clear while waiting.
  if (isDioxusGisEmbed() && !local && !token) {
    return null
  }

  if (!isWorkspaceApiConfigured()) {
    return local
  }

  if (!token || isAccessTokenExpired(token)) {
    const refreshed = await tryRefreshSession()
    if (refreshed) return refreshed
    if (local) startSession(null)
    return null
  }

  const { ok, status, data } = await workspaceFetch<{
    ok?: boolean
    user?: PublicAuthUser
    error?: string
  }>('/api/auth/me')

  if (!ok || !data.ok || !data.user) {
    if (status === 401 || status === 403) {
      const refreshed = await tryRefreshSession()
      if (refreshed) return refreshed
      startSession(null)
      return null
    }
    return local
  }

  const merged = publicUserToCurrent(data.user)
  startSession(merged, { persist: isSessionPersisted(), accessToken: token })
  return merged
}

async function tryRefreshSession(): Promise<CurrentUser | null> {
  const { ok, data } = await workspaceFetch<{
    ok?: boolean
    user?: PublicAuthUser
    accessToken?: string
  }>('/api/auth/refresh', { method: 'POST' })
  if (!ok || !data.ok || !data.user) return null
  const merged = publicUserToCurrent(data.user)
  startSession(merged, { persist: isSessionPersisted(), accessToken: data.accessToken })
  return merged
}

export async function apiLogout(): Promise<void> {
  if (isWorkspaceApiConfigured()) {
    try {
      await workspaceFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
  }
  clearBuiltinTokenBrowserOverrides()
  resetUserTokenSessionSync()
  startSession(null)
}
