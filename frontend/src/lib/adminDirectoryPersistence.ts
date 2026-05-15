/**
 * Syncs User Management (adminUsers) + audit log to the Node backend file store
 * so changes survive deploys/restarts when AGRI_ADMIN_DIRECTORY_FILE is on a persistent volume.
 *
 * @see backend/server/adminDirectoryPersistence.js
 */
import { normalizeEmail } from './auth'
import { AUDIT_LOG_STORAGE_KEY } from './auditConstants'

const ADMIN_USERS_KEY = 'adminUsers'
const DEFAULT_DIRECTORY_API = '/api/v1/admin/directory'

function adminDirectoryApiBase(): string {
  const raw = import.meta.env.VITE_AGRI_ADMIN_DIRECTORY_URL
  const u = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
  return u || DEFAULT_DIRECTORY_API
}

function adminDirectoryAuthHeaders(): HeadersInit {
  const raw = import.meta.env.VITE_AGRI_ADMIN_DIRECTORY_TOKEN
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return {}
  return { 'X-Agri-Admin-Directory-Token': t, Authorization: `Bearer ${t}` }
}

function readUsersFromStorage(): unknown[] {
  try {
    const raw = localStorage.getItem(ADMIN_USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readAuditFromStorage(): unknown[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export type AdminDirectoryPayload = {
  users: unknown[]
  auditLog: unknown[]
  updatedAt?: string | null
}

export async function pullAdminDirectoryFromServer(): Promise<AdminDirectoryPayload | null> {
  try {
    const res = await fetch(adminDirectoryApiBase(), {
      method: 'GET',
      headers: { ...adminDirectoryAuthHeaders() },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; users?: unknown[]; auditLog?: unknown[]; updatedAt?: string | null }
    if (!data || data.ok === false) return null
    const users = Array.isArray(data.users) ? data.users : []
    const auditLog = Array.isArray(data.auditLog) ? data.auditLog : []
    return { users, auditLog, updatedAt: data.updatedAt ?? null }
  } catch {
    return null
  }
}

export async function pushAdminDirectoryToServer(users: unknown[], auditLog: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(adminDirectoryApiBase(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminDirectoryAuthHeaders() },
      body: JSON.stringify({ users, auditLog }),
    })
    return res.ok
  } catch {
    return false
  }
}

export type AdminDirectoryStats = {
  ok?: boolean
  storage?: string
  totalUsers: number
  verifiedUsers: number
  loginsLast7Days: number | null
  byRole: Record<string, number>
  byStatus: Record<string, number>
}

function adminDirectoryStatsUrl(): string {
  const base = adminDirectoryApiBase().replace(/\/$/, '')
  return `${base}/stats`
}

export async function fetchAdminDirectoryStats(): Promise<AdminDirectoryStats | null> {
  try {
    const res = await fetch(adminDirectoryStatsUrl(), {
      method: 'GET',
      headers: { ...adminDirectoryAuthHeaders() },
    })
    if (!res.ok) return null
    const data = (await res.json()) as AdminDirectoryStats & { ok?: boolean }
    if (!data || data.ok === false) return null
    return {
      totalUsers: Number(data.totalUsers) || 0,
      verifiedUsers: Number(data.verifiedUsers) || 0,
      loginsLast7Days: data.loginsLast7Days == null ? null : Number(data.loginsLast7Days),
      byRole: data.byRole && typeof data.byRole === 'object' ? data.byRole : {},
      byStatus: data.byStatus && typeof data.byStatus === 'object' ? data.byStatus : {},
      storage: data.storage,
    }
  } catch {
    return null
  }
}

let syncTimer: number | null = null

/** Debounced full snapshot sync (reads latest localStorage). */
export function scheduleAdminDirectorySync(): void {
  if (syncTimer != null) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    void flushAdminDirectoryToServer()
  }, 450)
}

export async function flushAdminDirectoryToServer(): Promise<boolean> {
  const users = readUsersFromStorage()
  const auditLog = readAuditFromStorage()
  return pushAdminDirectoryToServer(users, auditLog)
}

/** Next stable numeric id for a new directory row (max existing + 1). */
export function nextAdminUserId(existing: unknown[]): number {
  let max = 0
  for (const row of Array.isArray(existing) ? existing : []) {
    const id = Number((row as { id?: unknown })?.id)
    if (Number.isFinite(id) && id > max) max = id
  }
  return max + 1
}

/**
 * Merge a server directory snapshot (passwords stripped → `hasPassword`) into locally cached
 * `adminUsers` without dropping `passwordHash`, `verificationToken`, or `profileExtra`.
 */
export function mergeAdminUsersPreservingLocalSecrets(
  previous: unknown[],
  remoteUsers: unknown[],
): unknown[] {
  const prevList = Array.isArray(previous) ? previous : []
  const prevById = new Map<number, Record<string, unknown>>()
  const prevByEmail = new Map<string, Record<string, unknown>>()
  for (const raw of prevList) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = Number(r.id)
    const em = normalizeEmail(typeof r.email === 'string' ? r.email : '')
    if (Number.isFinite(id) && id > 0) prevById.set(id, r)
    if (em) prevByEmail.set(em, r)
  }

  const remoteById = new Set<number>()
  const merged: unknown[] = []

  for (const raw of Array.isArray(remoteUsers) ? remoteUsers : []) {
    if (!raw || typeof raw !== 'object') continue
    const remote = raw as Record<string, unknown>
    const id = Number(remote.id)
    if (!Number.isFinite(id) || id <= 0) continue
    const em = normalizeEmail(typeof remote.email === 'string' ? String(remote.email) : '')
    const local = (em && prevByEmail.get(em)) || prevById.get(id) || {}
    const next: Record<string, unknown> = { ...local, ...remote }

    const prevHash = typeof local.passwordHash === 'string' ? local.passwordHash.trim() : ''
    const nextHash = typeof next.passwordHash === 'string' ? String(next.passwordHash).trim() : ''
    if (!nextHash && prevHash) next.passwordHash = prevHash

    const prevTok =
      typeof local.verificationToken === 'string' ? String(local.verificationToken) : ''
    const nextTok =
      typeof next.verificationToken === 'string' ? String(next.verificationToken) : ''
    if (!nextTok && prevTok) next.verificationToken = prevTok

    const prevPe = local.profileExtra
    if (prevPe && typeof prevPe === 'object' && (!next.profileExtra || typeof next.profileExtra !== 'object')) {
      next.profileExtra = prevPe
    } else if (
      prevPe &&
      typeof prevPe === 'object' &&
      next.profileExtra &&
      typeof next.profileExtra === 'object'
    ) {
      next.profileExtra = { ...(prevPe as object), ...(next.profileExtra as object) }
    }

    if (typeof next.passwordHash === 'string' && next.passwordHash.length > 0) {
      next.hasPassword = true
    }

    merged.push(next)
    remoteById.add(id)
  }

  for (const raw of prevList) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = Number(r.id)
    const em = normalizeEmail(typeof r.email === 'string' ? String(r.email) : '')
    if (!Number.isFinite(id) || id <= 0) continue
    if (remoteById.has(id)) continue
    const stillOnServer = (Array.isArray(remoteUsers) ? remoteUsers : []).some(x => {
      if (!x || typeof x !== 'object') return false
      const o = x as Record<string, unknown>
      return normalizeEmail(String(o.email || '')) === em && em.length > 0
    })
    if (!stillOnServer) merged.push(r)
  }

  merged.sort((a, b) => Number((a as { id?: unknown }).id) - Number((b as { id?: unknown }).id))
  return merged
}
