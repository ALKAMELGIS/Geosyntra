import { normalizeEmail } from '../auth'
import {
  buildLocalVerificationLink,
  createVerificationToken,
  verificationExpiresAt,
} from '../onboarding/localAuthVerification'
import { apiResendVerification, isAuthApiConfigured } from '../onboarding/authApi'
import { appendAuditLog } from '../audit'
import {
  flushAdminDirectoryToServerNow,
  mergeAdminUsersPreservingLocalSecrets,
  nextAdminUserId,
  scheduleAdminDirectorySync,
} from '../adminDirectoryPersistence'
import { bootstrapAdminDirectory } from './adminDirectoryBootstrap'
import {
  buildAdminDirectorySnapshot,
  downloadAdminDirectorySnapshot,
  readAuditLogRaw,
} from './adminDirectorySnapshot'
import {
  ADMIN_USER_PLANS,
  ADMIN_USER_STATUSES,
  normalizeAdminUser,
  type AdminDirectoryUser,
  type AdminUserPlan,
  type AdminUserStatus,
} from './adminUserModel'
import { filterTombstonedEmails, isAdminUserEmailTombstoned, tombstoneAdminUserEmail } from './adminUserTombstones'
import { apiDeleteUser, isRbacApiConfigured } from '../rbacApi'
import { readAccessToken } from '../auth'

const ADMIN_USERS_KEY = 'adminUsers'

function readRaw(): unknown[] {
  try {
    const raw = localStorage.getItem(ADMIN_USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRaw(users: unknown[]): void {
  localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users))
  scheduleAdminDirectorySync()
}

export function listAdminUsers(): AdminDirectoryUser[] {
  return filterTombstonedEmails(
    readRaw()
      .map(normalizeAdminUser)
      .filter((u): u is AdminDirectoryUser => u != null),
  ).sort((a, b) => b.id - a.id)
}

export function getAdminUserById(id: number): AdminDirectoryUser | null {
  return listAdminUsers().find(u => u.id === id) ?? null
}

export function getAdminUserByEmail(email: string): AdminDirectoryUser | null {
  const key = normalizeEmail(email)
  return listAdminUsers().find(u => normalizeEmail(u.email) === key) ?? null
}

export async function hydrateAdminUsersFromServer(): Promise<void> {
  await bootstrapAdminDirectory()
}

export function countDirectoryOwners(users: AdminDirectoryUser[] = listAdminUsers()): number {
  return users.filter(u => {
    const role = u.role.trim().toLowerCase()
    return role === 'owner' || role === 'super admin'
  }).length
}

export function exportAdminDirectoryJsonBackup(): void {
  downloadAdminDirectorySnapshot(buildAdminDirectorySnapshot(readRaw(), readAuditLogRaw()))
}

export function upsertAdminUser(patch: Partial<AdminDirectoryUser> & { email: string }): AdminDirectoryUser {
  const email = normalizeEmail(patch.email)
  if (isAdminUserEmailTombstoned(email)) {
    throw new Error(`Cannot restore deleted account: ${email}`)
  }
  const users = readRaw()
  const normalized = users.map(normalizeAdminUser).filter((u): u is AdminDirectoryUser => u != null)
  const idx = normalized.findIndex(u => normalizeEmail(u.email) === email)
  const existing = idx >= 0 ? normalized[idx]! : null
  const next: AdminDirectoryUser = {
    id: existing?.id ?? nextAdminUserId(users),
    name: patch.name ?? existing?.name ?? email,
    email,
    role: patch.role ?? existing?.role ?? 'Viewer',
    status: patch.status ?? existing?.status ?? 'Active',
    plan: patch.plan ?? existing?.plan ?? 'Free',
    emailVerified: patch.emailVerified ?? existing?.emailVerified ?? false,
    organization: patch.organization ?? existing?.organization,
    country: patch.country ?? existing?.country,
    lastLogin: patch.lastLogin ?? existing?.lastLogin,
    createdAt: patch.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
    passwordHash: patch.passwordHash ?? existing?.passwordHash,
    verificationToken: patch.verificationToken ?? existing?.verificationToken,
    verificationTokenExpires: patch.verificationTokenExpires ?? existing?.verificationTokenExpires,
    profileExtra: patch.profileExtra ?? existing?.profileExtra,
  }
  const out = [...normalized]
  if (idx >= 0) out[idx] = next
  else out.push(next)
  writeRaw(out)
  return next
}

export function updateAdminUser(
  id: number,
  patch: Partial<Omit<AdminDirectoryUser, 'id'>>,
): AdminDirectoryUser | null {
  const users = listAdminUsers()
  const idx = users.findIndex(u => u.id === id)
  if (idx < 0) return null
  const current = users[idx]!
  const next: AdminDirectoryUser = {
    ...current,
    ...patch,
    id: current.id,
    email: current.email,
  }
  const out = [...users]
  out[idx] = next
  writeRaw(out)
  return next
}

export function deleteAdminUserSoft(id: number): void {
  updateAdminUser(id, { status: 'Suspended' })
}

export type DeleteAdminUserResult =
  | { ok: true }
  | { ok: false; reason: 'missing_email' | 'last_owner' | 'server_rejected' | 'server_unreachable' }

/**
 * Permanently remove a user from the directory + auth store (when RBAC API is live).
 * Tombstones the email so merges on refresh cannot resurrect the row.
 */
export async function deleteAdminUser(id: number, emailHint?: string): Promise<DeleteAdminUserResult> {
  const existing = getAdminUserById(id)
  const email = normalizeEmail(emailHint ?? existing?.email ?? '')
  if (!email) return { ok: false, reason: 'missing_email' }

  const owners = countDirectoryOwners()
  const targetRole = (existing?.role ?? '').trim().toLowerCase()
  if ((targetRole === 'owner' || targetRole === 'super admin') && owners <= 1) {
    return { ok: false, reason: 'last_owner' }
  }

  if (isRbacApiConfigured() && readAccessToken()) {
    const server = await apiDeleteUser(id)
    if (!server.ok) {
      if (server.error === 'last_owner' || server.error === 'cannot_delete_self' || server.error === 'protected_account') {
        return { ok: false, reason: 'server_rejected' }
      }
      return { ok: false, reason: 'server_unreachable' }
    }
  }

  tombstoneAdminUserEmail(email)

  const raw = readRaw()
  const next = raw.filter(row => {
    const parsed = normalizeAdminUser(row)
    if (!parsed) return true
    return parsed.id !== id && normalizeEmail(parsed.email) !== email
  })
  writeRaw(next)

  appendAuditLog({
    entity: 'user',
    entityId: String(id),
    action: 'directory.user.removed',
    meta: { email, permanent: true },
  })

  await flushAdminDirectoryToServerNow()
  return { ok: true }
}


export function adminUserStats(users: AdminDirectoryUser[] = listAdminUsers()) {
  const byStatus: Record<string, number> = {}
  const byPlan: Record<string, number> = {}
  const byRole: Record<string, number> = {}
  for (const u of users) {
    byStatus[u.status] = (byStatus[u.status] ?? 0) + 1
    byPlan[u.plan] = (byPlan[u.plan] ?? 0) + 1
    byRole[u.role] = (byRole[u.role] ?? 0) + 1
  }
  return {
    total: users.length,
    verified: users.filter(u => u.emailVerified).length,
    pending: users.filter(u => !u.emailVerified || u.status === 'Pending Verification').length,
    byStatus,
    byPlan,
    byRole,
  }
}

export function exportAdminUsersCsv(users: AdminDirectoryUser[] = listAdminUsers()): string {
  const head = ['id', 'name', 'email', 'status', 'plan', 'role', 'emailVerified', 'lastLogin', 'createdAt']
  const lines = users.map(u =>
    [
      u.id,
      `"${u.name.replace(/"/g, '""')}"`,
      u.email,
      u.status,
      u.plan,
      u.role,
      u.emailVerified ? 'yes' : 'no',
      u.lastLogin ?? '',
      u.createdAt ?? '',
    ].join(','),
  )
  return [head.join(','), ...lines].join('\n')
}

export function isValidAdminPlan(plan: string): plan is AdminUserPlan {
  return ADMIN_USER_PLANS.includes(plan as AdminUserPlan)
}

export function isValidAdminStatus(status: string): status is AdminUserStatus {
  return ADMIN_USER_STATUSES.includes(status as AdminUserStatus)
}

/** Admin action: resend verification (API email when configured, else local dev link). */
export async function adminResendVerificationLink(id: number): Promise<string | null> {
  const user = getAdminUserById(id)
  if (!user) return null
  if (isAuthApiConfigured()) {
    const result = await apiResendVerification(user.email)
    if (!result.ok) return null
    return result.devVerificationLink ?? null
  }
  const token = createVerificationToken()
  updateAdminUser(id, {
    verificationToken: token,
    verificationTokenExpires: verificationExpiresAt(),
    emailVerified: false,
    status: 'Pending Verification',
  })
  return buildLocalVerificationLink(token)
}
