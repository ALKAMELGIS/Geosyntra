import { displayRoleToSlug, normalizeRbacRole, USER_STATUSES } from './roles.js'
import { permissionsForRole } from './permissions.js'

export function statusAfterEmailVerify(roleDisplay) {
  const slug = normalizeRbacRole(displayRoleToSlug(roleDisplay))
  return slug === 'user' ? USER_STATUSES.PENDING_APPROVAL : USER_STATUSES.ACTIVE
}

export function toPublicAuthUser(user) {
  if (!user) return null
  const roleSlug = normalizeRbacRole(displayRoleToSlug(user.role))
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleSlug,
    status: user.status || 'Active',
    emailVerified: Boolean(user.emailVerified),
    permissions: permissionsForRole(roleSlug),
  }
}

export function canLoginUser(user) {
  if (!user || !user.emailVerified) return { ok: false, error: 'email_not_verified' }
  if (user.status === 'Suspended') return { ok: false, error: 'account_suspended' }
  const slug = normalizeRbacRole(displayRoleToSlug(user.role))
  if (user.status === 'Pending Approval' && slug === 'user') {
    return { ok: false, error: 'pending_approval', message: 'Your account is awaiting administrator approval.' }
  }
  if (user.status === 'Pending Verification') {
    return { ok: false, error: 'email_not_verified' }
  }
  return { ok: true }
}
