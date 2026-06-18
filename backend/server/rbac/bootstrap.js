import { normalizeRbacRole, displayRoleToSlug } from './roles.js'
import { createOrPromoteOwner } from './createOwnerAccount.js'
import { storeAwait } from '../storeAwait.js'

/**
 * One-time bootstrap: create Owner from env when no owner exists.
 *
 * RBAC_BOOTSTRAP_EMAIL, RBAC_BOOTSTRAP_PASSWORD (min 12 chars), optional RBAC_BOOTSTRAP_NAME
 */
export async function bootstrapRbacSuperAdmin(store) {
  const email = String(process.env.RBAC_BOOTSTRAP_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.RBAC_BOOTSTRAP_PASSWORD || '')
  const name = String(process.env.RBAC_BOOTSTRAP_NAME || 'System Owner').trim()
  if (!email || password.length < 12) return { skipped: true, reason: 'env_not_set' }

  const users = await storeAwait(store.listUsers?.() ?? [])
  const hasOwner = users.some(u => normalizeRbacRole(displayRoleToSlug(u.role)) === 'owner')
  if (hasOwner) return { skipped: true, reason: 'owner_exists' }

  const result = await createOrPromoteOwner(store, { email, password, name })
  if (result.ok) {
    if (result.created) console.info('[rbac] Bootstrapped Owner:', email)
    if (result.promoted) console.info('[rbac] Promoted existing user to Owner:', email)
    return result
  }
  console.error('[rbac] Bootstrap failed', result?.error)
  return result
}
