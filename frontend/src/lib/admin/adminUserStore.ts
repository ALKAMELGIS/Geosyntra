import { normalizeEmail } from '../auth'
import { buildLocalVerificationLink, createVerificationToken } from '../onboarding/localAuthVerification'
import {
  mergeAdminUsersPreservingLocalSecrets,
  nextAdminUserId,
  pullAdminDirectoryFromServer,
  scheduleAdminDirectorySync,
} from '../adminDirectoryPersistence'
import {
  ADMIN_USER_PLANS,
  normalizeAdminUser,
  type AdminDirectoryUser,
  type AdminUserPlan,
  type AdminUserStatus,
} from './adminUserModel'

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
  return readRaw()
    .map(normalizeAdminUser)
    .filter((u): u is AdminDirectoryUser => u != null)
    .sort((a, b) => b.id - a.id)
}

export function getAdminUserById(id: number): AdminDirectoryUser | null {
  return listAdminUsers().find(u => u.id === id) ?? null
}

export function getAdminUserByEmail(email: string): AdminDirectoryUser | null {
  const key = normalizeEmail(email)
  return listAdminUsers().find(u => normalizeEmail(u.email) === key) ?? null
}

export async function hydrateAdminUsersFromServer(): Promise<void> {
  const remote = await pullAdminDirectoryFromServer()
  if (!remote?.users?.length) return
  const merged = mergeAdminUsersPreservingLocalSecrets(readRaw(), remote.users)
  writeRaw(merged)
}

export function upsertAdminUser(patch: Partial<AdminDirectoryUser> & { email: string }): AdminDirectoryUser {
  const users = readRaw()
  const email = normalizeEmail(patch.email)
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
  return status === 'Active' || status === 'Suspended' || status === 'Pending Verification'
}

/** Admin action: regenerate verification token and return link (static / demo hosting). */
export function adminResendVerificationLink(id: number): string | null {
  const user = getAdminUserById(id)
  if (!user) return null
  const token = createVerificationToken()
  updateAdminUser(id, {
    verificationToken: token,
    emailVerified: false,
    status: 'Pending Verification',
  })
  return buildLocalVerificationLink(token)
}
