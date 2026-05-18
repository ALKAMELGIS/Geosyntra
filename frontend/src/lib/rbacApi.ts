import { readAccessToken } from './auth'

function apiBase(): string {
  return String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
}

export function isRbacApiConfigured(): boolean {
  return Boolean(apiBase())
}

async function rbacFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const base = apiBase()
  const token = readAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) }
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(`${base}${path}`, { ...init, headers })
    const data = (await res.json().catch(() => ({}))) as T
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'network_error' } as T }
  }
}

export type RbacPublicUser = {
  id: number
  name: string
  email: string
  role: string
  roleSlug: string
  status: string
  emailVerified: boolean
  permissions: string[]
}

export async function apiRbacMe(): Promise<{ ok: true; user: RbacPublicUser } | { ok: false }> {
  const { ok, data } = await rbacFetch<{ ok?: boolean; user?: RbacPublicUser }>('/api/rbac/me')
  if (ok && data.ok && data.user) return { ok: true, user: data.user }
  return { ok: false }
}

export async function apiCreateInvite(input: {
  email: string
  roleSlug: string
}): Promise<{ ok: true; devInviteLink?: string } | { ok: false; error: string }> {
  const { ok, status, data } = await rbacFetch<{
    ok?: boolean
    error?: string
    devInviteLink?: string
  }>('/api/rbac/invites', { method: 'POST', body: JSON.stringify(input) })
  if (ok && data.ok) return { ok: true, devInviteLink: data.devInviteLink }
  return { ok: false, error: data.error || (status === 403 ? 'Not allowed to invite this role.' : 'Invite failed.') }
}

export async function apiPreviewInvite(token: string) {
  const { ok, data } = await rbacFetch<{
    ok?: boolean
    invite?: { email: string; role: string; roleSlug: string; expiresAt: string }
    error?: string
  }>(`/api/rbac/invites/preview?token=${encodeURIComponent(token)}`)
  return { ok: ok && Boolean(data.ok), invite: data.invite, error: data.error }
}

export async function apiAcceptInvite(input: {
  token: string
  name: string
  password: string
}): Promise<
  | { ok: true; user: RbacPublicUser; accessToken: string }
  | { ok: false; error: string }
> {
  const { ok, data } = await rbacFetch<{
    ok?: boolean
    user?: RbacPublicUser
    accessToken?: string
    error?: string
  }>('/api/rbac/invites/accept', { method: 'POST', body: JSON.stringify(input) })
  if (ok && data.ok && data.user && data.accessToken) {
    return { ok: true, user: data.user, accessToken: data.accessToken }
  }
  return { ok: false, error: data.error || 'Could not accept invitation.' }
}

export async function apiApproveUser(id: number): Promise<boolean> {
  const { ok } = await rbacFetch(`/api/rbac/users/${id}/approve`, { method: 'POST', body: '{}' })
  return ok
}

export async function apiSuspendUser(id: number): Promise<boolean> {
  const { ok } = await rbacFetch(`/api/rbac/users/${id}/suspend`, { method: 'POST', body: '{}' })
  return ok
}

export async function apiReactivateUser(id: number): Promise<boolean> {
  const { ok } = await rbacFetch(`/api/rbac/users/${id}/reactivate`, { method: 'POST', body: '{}' })
  return ok
}

export async function apiAssignUserRole(id: number, roleSlug: string): Promise<boolean> {
  const { ok } = await rbacFetch(`/api/rbac/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ roleSlug }),
  })
  return ok
}

export async function apiRbacUsers(): Promise<RbacPublicUser[]> {
  const { ok, data } = await rbacFetch<{ ok?: boolean; users?: RbacPublicUser[] }>('/api/rbac/users')
  if (ok && data.ok && Array.isArray(data.users)) return data.users
  return []
}

export async function apiRbacAudit(limit = 100) {
  const { ok, data } = await rbacFetch<{ ok?: boolean; audit?: unknown[] }>(
    `/api/rbac/audit?limit=${limit}`,
  )
  if (ok && data.ok && Array.isArray(data.audit)) return data.audit
  return []
}

export async function apiPermissionsMatrix() {
  const { ok, data } = await rbacFetch<{ ok?: boolean; matrix?: { role: string; permissions: string[] }[] }>(
    '/api/rbac/permissions/matrix',
  )
  if (ok && data.ok && Array.isArray(data.matrix)) return data.matrix
  return []
}
