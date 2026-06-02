/**
 * Per-user API tokens — persisted in platform SQLite; hydrated after login.
 */
import { resolveApiUrl } from './apiClient'
import { readAccessToken } from './auth'
import type { ServerApiSecretsV3 } from './apiSecretsServerPersistence'
import type { PlatformCapabilities } from './platformTokenRuntime'

export type UserApiTokenMasked = {
  userId: number
  userEmail: string
  provider: string
  active: boolean
  configured: boolean
  masked: string
  updatedAt: string
  encrypted: boolean
}

function authHeaders(): HeadersInit {
  const token = readAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export async function fetchUserApiTokensMasked(): Promise<{
  ok: boolean
  tokens?: UserApiTokenMasked[]
  error?: string
}> {
  try {
    const res = await fetch(resolveApiUrl('/api/user/api-tokens'), {
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json()) as { ok?: boolean; tokens?: UserApiTokenMasked[]; error?: string }
    if (!res.ok) return { ok: false, error: data?.error || res.statusText }
    return { ok: true, tokens: data.tokens ?? [] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

/** Authenticated session — capabilities + optional legacy secrets (server-controlled). */
export async function fetchUserApiTokenSession(): Promise<{
  ok: boolean
  persisted?: boolean
  revision?: number
  capabilities?: PlatformCapabilities
  gatewayMode?: boolean
  secrets?: ServerApiSecretsV3
  error?: string
}> {
  try {
    const res = await fetch(resolveApiUrl('/api/user/api-tokens/session'), {
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json()) as {
      ok?: boolean
      persisted?: boolean
      revision?: number
      capabilities?: PlatformCapabilities
      gatewayMode?: boolean
      secrets?: ServerApiSecretsV3
      error?: string
    }
    if (!res.ok) return { ok: false, error: data?.error || res.statusText }
    return {
      ok: true,
      persisted: data.persisted,
      revision: data.revision,
      capabilities: data.capabilities,
      gatewayMode: data.gatewayMode,
      secrets: data.secrets,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

export async function upsertUserApiToken(
  provider: string,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(resolveApiUrl(`/api/user/api-tokens/${encodeURIComponent(provider)}`), {
      method: 'PUT',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify({ value: value.trim() }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string }
    if (!res.ok) return { ok: false, error: data?.message || data?.error || res.statusText }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

export async function deleteUserApiToken(provider: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(resolveApiUrl(`/api/user/api-tokens/${encodeURIComponent(provider)}`), {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = (await res.json()) as { ok?: boolean; error?: string }
  if (!res.ok) return { ok: false, error: data?.error || res.statusText }
  return { ok: true }
}
