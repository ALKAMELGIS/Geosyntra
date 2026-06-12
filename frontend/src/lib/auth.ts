import { ALL_GEO_PERMISSIONS, hasGeoCapability, type GeoPermission } from './geoEnterpriseUserModel'
import { readKeepSignedInPreference } from './authKeepSignedIn'
import { isSystemOwnerEmail, rbacHasPermission } from './rbacPermissions'
import type { CurrentUser, Role } from './authTypes'
import { normalizeEmail, normalizeRole } from './authTypes'

export type { Role, CurrentUser } from './authTypes'
export { normalizeEmail, normalizeRole } from './authTypes'

const CURRENT_USER_KEY = 'currentUser'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

type StoredSessionEnvelope = {
  token: string
  accessToken?: string
  issuedAt: string
  expiresAt?: string
  user: CurrentUser
}

function readEnvelope(): StoredSessionEnvelope | null {
  try {
    const raw = readRawSessionOrLocal()
    if (!raw) return null
    return JSON.parse(raw) as StoredSessionEnvelope
  } catch {
    return null
  }
}

export const readAccessToken = (): string | null => {
  const env = readEnvelope()
  const t = env?.accessToken
  return typeof t === 'string' && t.trim() ? t.trim() : null
}

function readRawSessionOrLocal(): string | null {
  try {
    const sessionRaw = sessionStorage.getItem(CURRENT_USER_KEY)
    if (sessionRaw) return sessionRaw
    const localRaw = localStorage.getItem(CURRENT_USER_KEY)
    if (!localRaw) return null
    const parsed = JSON.parse(localRaw) as Partial<StoredSessionEnvelope> | null
    const expiresAt = typeof parsed?.expiresAt === 'string' ? parsed.expiresAt : ''
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(CURRENT_USER_KEY)
      return null
    }
    return localRaw
  } catch {
    return null
  }
}

function parseCurrentUser(raw: string | null): CurrentUser | null {
  try {
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const obj =
      'user' in (parsed as Record<string, unknown>) &&
      (parsed as Record<string, unknown>).user &&
      typeof (parsed as Record<string, unknown>).user === 'object'
        ? ((parsed as StoredSessionEnvelope).user as unknown as Record<string, unknown>)
        : (parsed as Record<string, unknown>)
    const id = typeof obj.id === 'number' ? obj.id : Number(obj.id ?? 0)
    const email = String(obj.email ?? '').trim()
    if (!email) return null
    return {
      id: Number.isFinite(id) && id > 0 ? id : Date.now(),
      name: String(obj.name ?? email),
      email,
      role: typeof obj.role === 'string' ? obj.role : normalizeRole(obj.role),
      roleSlug: typeof obj.roleSlug === 'string' ? obj.roleSlug : undefined,
      status: typeof obj.status === 'string' ? obj.status : undefined,
      permissions: Array.isArray(obj.permissions) ? (obj.permissions as string[]) : undefined,
      scope: typeof obj.scope === 'string' && obj.scope.trim() ? obj.scope.trim() : undefined,
      managedById: typeof obj.managedById === 'number' ? obj.managedById : undefined,
    }
  } catch {
    return null
  }
}

export const readCurrentUser = (): CurrentUser | null => parseCurrentUser(readRawSessionOrLocal())

/** True when the active session envelope lives in localStorage (persistent login). */
export function isSessionPersisted(): boolean {
  try {
    return !!localStorage.getItem(CURRENT_USER_KEY)
  } catch {
    return false
  }
}

export type StartSessionOptions = {
  /** When true, session is kept in localStorage until expiry. When false, sessionStorage only (tab session). */
  persist?: boolean
  /** Optional persistent session duration in milliseconds. */
  persistTtlMs?: number
  /** JWT from API login (sent as Authorization: Bearer). */
  accessToken?: string
}

export const startSession = (user: Partial<CurrentUser> | null, options?: StartSessionOptions): void => {
  try {
    if (!user) {
      sessionStorage.removeItem(CURRENT_USER_KEY)
      localStorage.removeItem(CURRENT_USER_KEY)
    } else {
      const persist =
        options?.persist !== undefined ? options.persist === true : readKeepSignedInPreference()
      const existing = parseCurrentUser(readRawSessionOrLocal())
      const merged: CurrentUser = {
        id: typeof user.id === 'number' ? user.id : existing?.id ?? Date.now(),
        name: typeof user.name === 'string' && user.name.trim() ? user.name.trim() : existing?.name ?? 'User',
        email: typeof user.email === 'string' ? user.email.trim() : existing?.email ?? '',
        role: typeof user.role === 'string' ? user.role : existing?.role ?? 'User',
        roleSlug: typeof user.roleSlug === 'string' ? user.roleSlug : existing?.roleSlug,
        status: typeof user.status === 'string' ? user.status : existing?.status,
        permissions: Array.isArray(user.permissions) ? user.permissions : existing?.permissions,
        scope: typeof user.scope === 'string' && user.scope.trim() ? user.scope.trim() : existing?.scope,
        managedById: typeof user.managedById === 'number' ? user.managedById : existing?.managedById,
      }
      const now = Date.now()
      const sessionToken =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${now}-${Math.random().toString(36).slice(2)}`
      const ttl = Math.max(1000 * 60, Number(options?.persistTtlMs || SESSION_TTL_MS))
      const envelope: StoredSessionEnvelope = {
        token: sessionToken,
        accessToken: options?.accessToken ?? readAccessToken() ?? undefined,
        issuedAt: new Date(now).toISOString(),
        expiresAt: persist ? new Date(now + ttl).toISOString() : undefined,
        user: merged,
      }
      if (options?.accessToken) envelope.accessToken = options.accessToken
      const json = JSON.stringify(envelope)
      if (persist) {
        localStorage.setItem(CURRENT_USER_KEY, json)
        sessionStorage.removeItem(CURRENT_USER_KEY)
      } else {
        sessionStorage.setItem(CURRENT_USER_KEY, json)
        localStorage.removeItem(CURRENT_USER_KEY)
      }
    }
    window.dispatchEvent(new Event('storage'))
  } catch {
    /* ignore */
  }
}

const GEO_PERMISSION_SET = new Set<string>(ALL_GEO_PERMISSIONS)

const legacyRoleAllows = (role: Role, permission: string): boolean => {
  if (role === 'Super Admin' || role === 'Admin') return true
  if (permission === 'dataSource.update') return role === 'Manager'
  if (permission === 'admin.users.manage') {
    return role === 'Manager' || role === 'Admin Manager' || role === 'Analyst'
  }
  if (permission === 'admin.panel') {
    return role === 'Manager' || role === 'Admin Manager' || role === 'Analyst'
  }
  return false
}

export const hasPermission = (permission: string, roleValue: unknown, serverPermissions?: string[]): boolean => {
  if (GEO_PERMISSION_SET.has(permission)) {
    return hasGeoCapability(permission as GeoPermission, roleValue)
  }
  if (permission.startsWith('admin.')) {
    return rbacHasPermission(permission, roleValue, serverPermissions)
  }
  const role = normalizeRole(roleValue)
  return legacyRoleAllows(role, permission) || rbacHasPermission(permission, roleValue, serverPermissions)
}

export function isPlatformOwnerUser(user: CurrentUser | null | undefined): boolean {
  if (!user) return false
  if (isSystemOwnerEmail(user.email)) return true
  const slug = String(user.roleSlug ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (slug === 'owner' || slug === 'super_admin') return true
  const role = normalizeRole(user.role)
  return role === 'Owner' || role === 'Super Admin'
}

export const currentUserHasPermission = (permission: string): boolean => {
  const user = readCurrentUser()
  if (!user) return false
  if (isPlatformOwnerUser(user)) return true
  return hasPermission(permission, user.role, user.permissions)
}

export const canManageDataSourceSettings = (): boolean => {
  const user = readCurrentUser()
  const role = normalizeRole(user?.role)
  return role === 'Super Admin' || role === 'Admin' || role === 'Manager'
}
