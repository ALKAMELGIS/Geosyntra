import { promoteWorkspaceRole } from './promoteWorkspaceRole.js'
import { isSystemOwnerEmail, listSystemOwnerEmails } from './systemOwnerEmails.js'
import { RBAC_ROLES, USER_STATUSES } from './roles.js'

/** Patch in-memory directory row before persist. */
export function applySystemOwnerToDirectoryUser(user) {
  if (!user || !isSystemOwnerEmail(user.email)) return user
  return {
    ...user,
    role: RBAC_ROLES.SUPER_ADMIN,
    status: USER_STATUSES.ACTIVE,
    emailVerified: true,
    verificationToken: null,
    verificationTokenExpires: null,
    profileExtra: {
      ...(typeof user.profileExtra === 'object' && user.profileExtra ? user.profileExtra : {}),
      roleSlug: 'super_admin',
      systemOwner: true,
    },
  }
}

/** On server start — promote configured emails to Owner in the directory store. */
export function bootstrapSystemOwners(store) {
  const results = []
  for (const email of listSystemOwnerEmails()) {
    try {
      const r = promoteWorkspaceRole(store, email, 'super_admin')
      results.push({ email, ...r })
      if (r.ok && !r.unchanged) {
        console.info('[rbac] System owner promoted:', email)
      }
    } catch (e) {
      console.error('[rbac] System owner bootstrap failed for', email, e)
      results.push({ email, ok: false, error: String(e) })
    }
  }
  return results
}
