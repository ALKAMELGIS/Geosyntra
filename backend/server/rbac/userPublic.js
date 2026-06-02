import {
  displayRoleToSlug,
  normalizeRbacRole,
  roleRequiresApprovalAfterVerify,
  USER_STATUSES,
} from './roles.js'
import { permissionsForRole } from './permissions.js'
import { isSystemOwnerEmail } from './systemOwnerEmails.js'
import { RBAC_ROLES } from './roles.js'

export function statusAfterEmailVerify(roleDisplay) {
  const slug = normalizeRbacRole(displayRoleToSlug(roleDisplay))
  return roleRequiresApprovalAfterVerify(slug)
    ? USER_STATUSES.PENDING_APPROVAL
    : USER_STATUSES.ACTIVE
}

export function toPublicAuthUser(user) {
  if (!user) return null
  if (isSystemOwnerEmail(user.email)) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: RBAC_ROLES.OWNER,
      roleSlug: 'owner',
      status: USER_STATUSES.ACTIVE,
      emailVerified: true,
      permissions: permissionsForRole('owner'),
    }
  }
  const roleSlug = normalizeRbacRole(displayRoleToSlug(user.role))
  const extra = user.profileExtra && typeof user.profileExtra === 'object' ? user.profileExtra : {}
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username || extra.username || undefined,
    profileImage: user.profileImage || extra.profileImage || undefined,
    oauthProvider: extra.oauthProvider || undefined,
    oauthProviders: Array.isArray(extra.oauthProviders) ? extra.oauthProviders : undefined,
    role: user.role,
    roleSlug,
    status: user.status || 'Active',
    emailVerified: Boolean(user.emailVerified),
    permissions: permissionsForRole(roleSlug),
    createdAt: user.createdAt || undefined,
    lastLogin: user.lastLogin || undefined,
  }
}

export function canLoginUser(user) {
  if (!user) return { ok: false, error: 'invalid_credentials' }
  if (isSystemOwnerEmail(user.email)) return { ok: true }
  if (!user.emailVerified) return { ok: false, error: 'email_not_verified' }
  if (user.status === 'Suspended') return { ok: false, error: 'account_suspended' }
  const slug = normalizeRbacRole(displayRoleToSlug(user.role))
  if (user.status === 'Pending Approval' && roleRequiresApprovalAfterVerify(slug)) {
    return { ok: false, error: 'pending_approval', message: 'Your account is awaiting administrator approval.' }
  }
  if (user.status === 'Pending Verification') {
    return { ok: false, error: 'email_not_verified' }
  }
  return { ok: true }
}
