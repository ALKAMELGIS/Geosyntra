import { RBAC_ROLES, normalizeRbacRole, displayRoleToSlug } from './roles.js'
import { USER_STATUSES } from './roles.js'

/**
 * One-time bootstrap: create Super Admin from env when no super_admin exists.
 *
 * RBAC_BOOTSTRAP_EMAIL, RBAC_BOOTSTRAP_PASSWORD (min 12 chars), optional RBAC_BOOTSTRAP_NAME
 */
export function bootstrapRbacSuperAdmin(store) {
  const email = String(process.env.RBAC_BOOTSTRAP_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.RBAC_BOOTSTRAP_PASSWORD || '')
  const name = String(process.env.RBAC_BOOTSTRAP_NAME || 'Super Admin').trim()
  if (!email || password.length < 12) return { skipped: true, reason: 'env_not_set' }

  const users = store.listUsers?.() ?? []
  const hasSuper = users.some(
    u => normalizeRbacRole(displayRoleToSlug(u.role)) === 'super_admin',
  )
  if (hasSuper) return { skipped: true, reason: 'super_admin_exists' }

  const existing = store.getUserByEmail(email)
  if (existing) {
    const slug = normalizeRbacRole(displayRoleToSlug(existing.role))
    if (slug === 'super_admin') return { skipped: true, reason: 'already_super' }
    store.setUserRole?.(existing.id, 'super_admin', {
      email: 'system',
      roleSlug: 'super_admin',
    })
    console.info('[rbac] Promoted existing user to Super Admin:', email)
    return { ok: true, promoted: true }
  }

  const result = store.createInvitedUser?.({
    email,
    name,
    password,
    roleDisplay: RBAC_ROLES.SUPER_ADMIN,
    invitedByEmail: 'bootstrap',
  })
  if (result?.ok) {
    console.info('[rbac] Bootstrapped Super Admin:', email)
    return { ok: true, created: true }
  }
  console.error('[rbac] Bootstrap failed', result?.error)
  return { ok: false, error: result?.error }
}
