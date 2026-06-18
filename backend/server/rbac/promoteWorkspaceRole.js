import {
  USER_STATUSES,
  displayRoleToSlug,
  normalizeRbacRole,
  rbacRoleToDisplay,
} from './roles.js'
import { storeAwait } from '../storeAwait.js'

const SYSTEM_ACTOR = Object.freeze({ email: 'system@rbac', roleSlug: 'owner' })

/**
 * Set workspace RBAC role for an existing user (CLI / env bootstrap).
 * Uses owner-level actor so assignments are not blocked by canAssignRole.
 */
export async function promoteWorkspaceRole(store, email, roleSlug = 'owner') {
  const em = String(email || '').trim().toLowerCase()
  if (!em) return { ok: false, error: 'email_required' }

  const user = await storeAwait(store.getUserByEmail?.(em))
  if (!user) return { ok: false, error: 'user_not_found', email: em }

  const targetSlug = normalizeRbacRole(roleSlug)
  const display = rbacRoleToDisplay(targetSlug)
  const prevSlug = normalizeRbacRole(displayRoleToSlug(user.role))

  if (prevSlug === targetSlug && user.status === USER_STATUSES.ACTIVE && user.emailVerified) {
    return { ok: true, unchanged: true, email: em, role: display, roleSlug: targetSlug }
  }

  const roleResult = await storeAwait(store.setUserRole?.(user.id, targetSlug, SYSTEM_ACTOR))
  if (roleResult && roleResult.ok === false) return { ...roleResult, email: em }

  if (user.status === USER_STATUSES.PENDING_APPROVAL && typeof store.approveUser === 'function') {
    await storeAwait(store.approveUser(user.id, SYSTEM_ACTOR))
  }
  if (user.status === USER_STATUSES.SUSPENDED && typeof store.reactivateUser === 'function') {
    await storeAwait(store.reactivateUser(user.id, SYSTEM_ACTOR))
  }

  return {
    ok: true,
    email: em,
    userId: user.id,
    role: display,
    roleSlug: targetSlug,
    previousRole: user.role,
    previousRoleSlug: prevSlug,
  }
}
