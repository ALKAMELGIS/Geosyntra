import {
  apiApproveUser,
  apiAssignUserRole,
  apiRbacUsers,
  apiReactivateUser,
  apiSuspendUser,
  isRbacApiConfigured,
  type RbacPublicUser,
} from '../rbacApi'
import { readAccessToken } from '../auth'
import { isAuthApiConfigured } from '../onboarding/authApi'
import { hydrateAdminUsersFromServer, listAdminUsers, updateAdminUser, upsertAdminUser } from './adminUserStore'
import type { AdminDirectoryUser, AdminUserStatus } from './adminUserModel'

export const RBAC_ASSIGNABLE_ROLES = [
  { slug: 'user', label: 'User' },
  { slug: 'analyst', label: 'Analyst' },
  { slug: 'manager', label: 'Manager' },
  { slug: 'admin', label: 'Admin' },
  { slug: 'super_admin', label: 'Super Admin' },
] as const

function mapRbacStatus(u: RbacPublicUser): AdminUserStatus {
  const raw = String(u.status ?? '').trim()
  if (raw === 'Suspended') return 'Suspended'
  if (raw === 'Pending Approval') return 'Pending Approval'
  if (raw === 'Pending Verification' || !u.emailVerified) return 'Pending Verification'
  return 'Active'
}

export function rbacUserToDirectory(u: RbacPublicUser): AdminDirectoryUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: mapRbacStatus(u),
    plan: 'Free',
    emailVerified: u.emailVerified,
    profileExtra: { roleSlug: u.roleSlug, permissions: u.permissions, source: 'rbac' },
  }
}

/** Load directory: RBAC API when configured + token, merged with local admin store rows. */
export async function loadUserManagementDirectory(): Promise<AdminDirectoryUser[]> {
  await hydrateAdminUsersFromServer()
  const local = listAdminUsers()

  if (!isRbacApiConfigured() || !readAccessToken()) {
    return local
  }

  const remote = await apiRbacUsers()
  if (!remote.length) {
    return local
  }

  const byEmail = new Map<string, AdminDirectoryUser>()
  for (const row of local) {
    byEmail.set(row.email.toLowerCase(), row)
  }
  for (const u of remote) {
    const mapped = rbacUserToDirectory(u)
    const prev = byEmail.get(mapped.email.toLowerCase())
    byEmail.set(mapped.email.toLowerCase(), {
      ...prev,
      ...mapped,
      plan: prev?.plan ?? mapped.plan,
      lastLogin: prev?.lastLogin ?? mapped.lastLogin,
      createdAt: prev?.createdAt ?? mapped.createdAt,
    })
  }
  return [...byEmail.values()].sort((a, b) => b.id - a.id)
}

export function registerPendingSignupInDirectory(input: {
  name: string
  email: string
}): void {
  upsertAdminUser({
    email: input.email,
    name: input.name,
    role: 'User',
    status: 'Pending Verification',
    plan: 'Free',
    emailVerified: false,
    createdAt: new Date().toISOString(),
    profileExtra: { lifecycle: 'signup', source: 'register' },
  })
}

export async function applyUserManagementAction(
  user: AdminDirectoryUser,
  action: 'approve' | 'suspend' | 'reactivate' | 'assign-role',
  roleSlug?: string,
): Promise<{ ok: boolean; message: string }> {
  const useRbac = isRbacApiConfigured() && readAccessToken()

  if (action === 'approve') {
    if (useRbac) {
      const ok = await apiApproveUser(user.id)
      if (ok) {
        updateAdminUser(user.id, { status: 'Active', emailVerified: true })
        return { ok: true, message: 'Account approved — user can sign in.' }
      }
      return { ok: false, message: 'Could not approve account on server.' }
    }
    updateAdminUser(user.id, { status: 'Active', emailVerified: true })
    return { ok: true, message: 'Account activated locally.' }
  }

  if (action === 'suspend') {
    if (useRbac) {
      const ok = await apiSuspendUser(user.id)
      if (ok) {
        updateAdminUser(user.id, { status: 'Suspended' })
        return { ok: true, message: 'Account suspended.' }
      }
      return { ok: false, message: 'Could not suspend account on server.' }
    }
    updateAdminUser(user.id, { status: 'Suspended' })
    return { ok: true, message: 'Account suspended locally.' }
  }

  if (action === 'reactivate') {
    if (useRbac) {
      const ok = await apiReactivateUser(user.id)
      if (ok) {
        updateAdminUser(user.id, { status: 'Active' })
        return { ok: true, message: 'Account reactivated.' }
      }
      return { ok: false, message: 'Could not reactivate account on server.' }
    }
    updateAdminUser(user.id, { status: 'Active' })
    return { ok: true, message: 'Account reactivated locally.' }
  }

  if (action === 'assign-role' && roleSlug) {
    const label = RBAC_ASSIGNABLE_ROLES.find(r => r.slug === roleSlug)?.label ?? roleSlug
    if (useRbac) {
      const ok = await apiAssignUserRole(user.id, roleSlug)
      if (ok) {
        updateAdminUser(user.id, { role: label, profileExtra: { ...user.profileExtra, roleSlug } })
        return { ok: true, message: `Role updated to ${label}.` }
      }
      return { ok: false, message: 'Could not assign role on server.' }
    }
    updateAdminUser(user.id, { role: label, profileExtra: { ...user.profileExtra, roleSlug } })
    return { ok: true, message: `Role updated to ${label} locally.` }
  }

  return { ok: false, message: 'Unknown action.' }
}

export function isUserManagementApiLive(): boolean {
  return isAuthApiConfigured() && Boolean(readAccessToken())
}
