/**
 * Central API token registry — server-side only. Never persist returned secrets in localStorage.
 */
import { describeWorkspaceFetchError, resolveApiUrl } from './apiClient'
import { readAccessToken } from './auth'

export type SystemTokenMasked = {
  name: string
  label: string
  category: string
  active: boolean
  configured: boolean
  masked: string
  source: 'database' | 'environment' | 'none'
  expiresAt: string | null
  lastTestedAt: string | null
  lastTestOk: boolean | null
  lastTestMessage: string | null
  updatedAt: string | null
  updatedBy: string | null
  encrypted: boolean
}

export type SystemTokenStatus = {
  name: string
  label: string
  category: string
  active: boolean
  configured: boolean
  source: string
}

function authHeaders(): HeadersInit {
  const token = readAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export async function fetchSystemTokenStatus(): Promise<{
  ok: boolean
  tokens?: SystemTokenStatus[]
  encrypted?: boolean
  error?: string
}> {
  try {
    const res = await fetch(resolveApiUrl('/api/system/tokens/status'), {
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      tokens?: SystemTokenStatus[]
      encrypted?: boolean
      error?: string
    }
    if (!res.ok) return { ok: false, error: data?.error || res.statusText }
    return { ok: true, tokens: data.tokens ?? [], encrypted: data.encrypted }
  } catch (e) {
    return { ok: false, error: describeWorkspaceFetchError(e) }
  }
}

export async function fetchSystemTokensAdmin(): Promise<{
  ok: boolean
  tokens?: SystemTokenMasked[]
  error?: string
}> {
  try {
    const res = await fetch(resolveApiUrl('/api/system/tokens'), {
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; tokens?: SystemTokenMasked[]; error?: string }
    if (!res.ok) return { ok: false, error: data?.error || res.statusText }
    return { ok: true, tokens: data.tokens ?? [] }
  } catch (e) {
    return { ok: false, error: describeWorkspaceFetchError(e) }
  }
}

export async function upsertSystemToken(
  name: string,
  value: string,
  opts?: { active?: boolean; expiresAt?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(resolveApiUrl(`/api/system/tokens/${encodeURIComponent(name)}`), {
      method: 'PUT',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify({ value, active: opts?.active !== false, expiresAt: opts?.expiresAt ?? null }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string }
    if (!res.ok) return { ok: false, error: data?.message || data?.error || res.statusText }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: describeWorkspaceFetchError(e) }
  }
}

export async function patchSystemToken(
  name: string,
  patch: { active?: boolean; value?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(resolveApiUrl(`/api/system/tokens/${encodeURIComponent(name)}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string }
    if (!res.ok) return { ok: false, error: data?.message || data?.error || res.statusText }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: describeWorkspaceFetchError(e) }
  }
}

export async function testSystemToken(name: string): Promise<{
  ok: boolean
  message?: string
  error?: string
}> {
  try {
    const res = await fetch(resolveApiUrl(`/api/system/tokens/${encodeURIComponent(name)}/test`), {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string }
    return { ok: Boolean(data.ok), message: data.message, error: data.error }
  } catch (e) {
    return { ok: false, error: describeWorkspaceFetchError(e) }
  }
}

export async function migrateTokensFromVault(): Promise<{ ok: boolean; migrated?: number; error?: string }> {
  try {
    const res = await fetch(resolveApiUrl('/api/system/tokens/migrate-from-vault'), {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; migrated?: number; error?: string }
    if (!res.ok) return { ok: false, error: data?.error || res.statusText }
    return { ok: true, migrated: data.migrated }
  } catch (e) {
    return { ok: false, error: describeWorkspaceFetchError(e) }
  }
}

/** When false (default), the SPA must not copy platform secrets into localStorage. */
export function clientApiSecretsHydrationEnabled(): boolean {
  return import.meta.env.VITE_ALLOW_CLIENT_API_SECRET_HYDRATION === 'true'
}
