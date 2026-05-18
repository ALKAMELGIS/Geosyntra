import { RBAC_ROLES, normalizeRbacRole, displayRoleToSlug } from './roles.js'
import { USER_STATUSES } from './roles.js'

/**
 * One-time bootstrap: create Owner from env when no owner exists.
 *
 * RBAC_BOOTSTRAP_EMAIL, RBAC_BOOTSTRAP_PASSWORD (min 12 chars), optional RBAC_BOOTSTRAP_NAME
 */
export function bootstrapRbacSuperAdmin(store) {
  const email = String(process.env.RBAC_BOOTSTRAP_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.RBAC_BOOTSTRAP_PASSWORD || '')
  const name = String(process.env.RBAC_BOOTSTRAP_NAME || 'Super Admin').trim()
  if (!email || password.length < 12) return { skipped: true, reason: 'env_not_set' }

  const users = store.listUsers?.() ?? []
  const hasOwner = users.some(u => normalizeRbacRole(displayRoleToSlug(u.role)) === 'owner')
  if (hasOwner) return { skipped: true, reason: 'owner_exists' }

  const existing = store.getUserByEmail(email)
  if (existing) {
    const slug = normalizeRbacRole(displayRoleToSlug(existing.role))
    if (slug === 'owner') return { skipped: true, reason: 'already_owner' }
    store.setUserRole?.(existing.id, 'owner', {
      email: 'system',
      roleSlug: 'owner',
    })
    console.info('[rbac] Promoted existing user to Owner:', email)
    return { ok: true, promoted: true }
  }

  const result = store.createInvitedUser?.({
    email,
    name,
    password,
    roleDisplay: RBAC_ROLES.OWNER,
    invitedByEmail: 'bootstrap',
  })
  if (result?.ok) {
    console.info('[rbac] Bootstrapped Owner:', email)
    return { ok: true, created: true }
  }
  console.error('[rbac] Bootstrap failed', result?.error)
  return { ok: false, error: result?.error }
}
