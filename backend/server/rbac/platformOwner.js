import { displayRoleToSlug, normalizeRbacRole } from './roles.js'
import { isSystemOwnerEmail } from './systemOwnerEmails.js'

/** Matches frontend isPlatformOwnerUser — system owner emails always count as Owner. */
export function isPlatformOwnerUserRecord(user) {
  if (!user) return false
  if (isSystemOwnerEmail(user.email)) return true
  const slug = normalizeRbacRole(displayRoleToSlug(user.role))
  return slug === 'owner' || slug === 'super_admin'
}

export function requirePlatformOwner(req, res, next) {
  if (!isPlatformOwnerUserRecord(req.authUser)) {
    return res.status(403).json({
      ok: false,
      error: 'owner_required',
      message: 'Only the platform Owner can manage API tokens.',
    })
  }
  next()
}
