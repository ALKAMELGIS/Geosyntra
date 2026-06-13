import { RBAC_ROLES, normalizeRbacRole, displayRoleToSlug } from './roles.js'
import { promoteWorkspaceRole } from './promoteWorkspaceRole.js'
import { storeAwait } from '../storeAwait.js'

/**
 * Create or promote a workspace Owner (CLI / bootstrap).
 * @param {object} store
 * @param {{ email: string, password?: string, name?: string, allowWhenOtherOwnerExists?: boolean }} opts
 */
export async function createOrPromoteOwner(store, opts) {
  const email = String(opts.email || '').trim().toLowerCase()
  const password = String(opts.password || '')
  const name = String(opts.name || 'System Owner').trim()
  const allowWhenOtherOwnerExists = Boolean(opts.allowWhenOtherOwnerExists)

  if (!email) return { ok: false, error: 'email_required' }

  const users = await storeAwait(store.listUsers?.() ?? [])
  const hasOtherOwner = users.some(u => {
    const slug = normalizeRbacRole(displayRoleToSlug(u.role))
    const em = String(u.email || '').trim().toLowerCase()
    return slug === 'owner' && em !== email
  })
  if (hasOtherOwner && !allowWhenOtherOwnerExists) {
    return { ok: false, error: 'owner_exists', hint: 'use_allow_when_other_owner_exists' }
  }

  const existing = await storeAwait(store.getUserByEmail?.(email))
  if (existing) {
    const slug = normalizeRbacRole(displayRoleToSlug(existing.role))
    if (slug === 'owner') {
      return { ok: true, unchanged: true, email, role: RBAC_ROLES.OWNER, roleSlug: 'owner' }
    }
    const promoted = await promoteWorkspaceRole(store, email, 'owner')
    if (!promoted.ok) return promoted
    return { ...promoted, promoted: true }
  }

  if (password.length < 12) {
    return { ok: false, error: 'password_min_12' }
  }

  const result = await storeAwait(
    store.createInvitedUser?.({
      email,
      name,
      password,
      roleDisplay: RBAC_ROLES.OWNER,
      invitedByEmail: 'create-owner',
    }),
  )
  if (result?.ok) {
    return { ok: true, created: true, email, role: RBAC_ROLES.OWNER, roleSlug: 'owner', userId: result.user?.id }
  }
  return { ok: false, error: result?.error || 'create_failed' }
}
