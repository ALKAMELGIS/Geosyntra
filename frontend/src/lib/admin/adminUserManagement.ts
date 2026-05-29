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
import { filterTombstonedEmails, isAdminUserEmailTombstoned } from './adminUserTombstones'
import { hydrateAdminUsersFromServer, listAdminUsers, updateAdminUser, upsertAdminUser } from './adminUserStore'
import type { AdminDirectoryUser, AdminUserStatus } from './adminUserModel'
import { adminPlanLabelForBillingId, normalizeSignupPlanId } from '../onboarding/signupPlans'

export const RBAC_ASSIGNABLE_ROLES = [
  { slug: 'trial_user', label: 'Trial User' },
  { slug: 'viewer', label: 'Viewer' },
  { slug: 'analyst', label: 'Analyst' },
  { slug: 'ai_operator', label: 'AI Operator' },
  { slug: 'manager', label: 'Manager' },
  { slug: 'admin', label: 'Admin' },
  { slug: 'owner', label: 'Owner' },
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

/** Load directory from central RBAC API when available; local rows are display cache only. */
export async function loadUserManagementDirectory(): Promise<AdminDirectoryUser[]> {
  if (isRbacApiConfigured() && readAccessToken()) {
    const remote = await apiRbacUsers()
    if (remote.length) {
      return filterTombstonedEmails(remote.map(rbacUserToDirectory)).sort((a, b) => b.id - a.id)
    }
  }

  if (isAuthApiConfigured()) {
    await hydrateAdminUsersFromServer()
    return filterTombstonedEmails(listAdminUsers())
  }

  await hydrateAdminUsersFromServer()
  return filterTombstonedEmails(listAdminUsers())
}

const SIGNUP_ROLE_LABELS: Record<string, string> = {
  trial_user: 'Trial User',
  viewer: 'Viewer',
  analyst: 'Analyst',
  ai_operator: 'AI Operator',
  manager: 'Manager',
  admin: 'Admin',
  owner: 'Owner',
}

export function registerPendingSignupInDirectory(input: {
  name: string
  email: string
  planId?: string
}): void {
  if (isAdminUserEmailTombstoned(input.email)) return
  const planId = normalizeSignupPlanId(input.planId)
  upsertAdminUser({
    email: input.email,
    name: input.name,
    role: 'Trial User',
    status: 'Pending Verification',
    plan: adminPlanLabelForBillingId(planId),
    emailVerified: false,
    createdAt: new Date().toISOString(),
    profileExtra: {
      lifecycle: 'signup',
      source: 'register',
      roleSlug: 'trial_user',
      billingPlanId: planId,
      signupPlan: planId,
    },
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
    }
    updateAdminUser(user.id, { status: 'Active', emailVerified: true })
    return {
      ok: true,
      message: useRbac
        ? 'Account activated locally (server did not respond).'
        : 'Account activated locally.',
    }
  }

  if (action === 'suspend') {
    if (useRbac) {
      const ok = await apiSuspendUser(user.id)
      if (ok) {
        updateAdminUser(user.id, { status: 'Suspended' })
        return { ok: true, message: 'Account suspended.' }
      }
    }
    updateAdminUser(user.id, { status: 'Suspended' })
    return {
      ok: true,
      message: useRbac
        ? 'Account suspended locally (server did not respond).'
        : 'Account suspended locally.',
    }
  }

  if (action === 'reactivate') {
    if (useRbac) {
      const ok = await apiReactivateUser(user.id)
      if (ok) {
        updateAdminUser(user.id, { status: 'Active' })
        return { ok: true, message: 'Account reactivated.' }
      }
    }
    updateAdminUser(user.id, { status: 'Active' })
    return {
      ok: true,
      message: useRbac
        ? 'Account reactivated locally (server did not respond).'
        : 'Account reactivated locally.',
    }
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

const ROLE_LABEL_TO_SLUG: Record<string, string> = {
  Owner: 'owner',
  'Super Admin': 'super_admin',
  Admin: 'admin',
  Manager: 'manager',
  'Admin Manager': 'manager',
  Analyst: 'analyst',
  Editor: 'analyst',
  Viewer: 'viewer',
  User: 'viewer',
  'AI Operator': 'ai_operator',
  'Trial User': 'trial_user',
}

export function adminRoleLabelToSlug(roleLabel: string): string {
  return ROLE_LABEL_TO_SLUG[roleLabel] ?? 'trial_user'
}

export async function saveAdminUserEdits(
  user: AdminDirectoryUser,
  patch: Partial<AdminDirectoryUser>,
): Promise<{ ok: boolean; message: string }> {
  updateAdminUser(user.id, patch)
  if (patch.role && patch.role !== user.role) {
    const slug = adminRoleLabelToSlug(patch.role)
    return applyUserManagementAction(user, 'assign-role', slug)
  }
  return { ok: true, message: 'User saved.' }
}
