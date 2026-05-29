import { verifyAccessToken } from './jwt.js'
import { readBearerOrCookieToken } from './authCookies.js'
import { hasPermission } from './permissions.js'
import { displayRoleToSlug, normalizeRbacRole } from './roles.js'
import { toPublicAuthUser } from './userPublic.js'

export function createAuthMiddleware(getStore) {
  return function requireAuth(req, res, next) {
    const token = readBearerOrCookieToken(req)
    if (!token) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    const verified = verifyAccessToken(token)
    if (!verified.ok) {
      return res.status(401).json({ ok: false, error: verified.error || 'invalid_token' })
    }
    const userId = Number(verified.payload.sub)
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ ok: false, error: 'invalid_subject' })
    }
    const user = getStore().getUserById?.(userId)
    if (!user) {
      return res.status(401).json({ ok: false, error: 'user_not_found' })
    }
    if (user.status === 'Suspended') {
      return res.status(403).json({ ok: false, error: 'account_suspended' })
    }
    const roleSlug = normalizeRbacRole(displayRoleToSlug(user.role))
    req.authUser = user
    req.authPublic = toPublicAuthUser(user)
    req.roleSlug = roleSlug
    req.accessToken = token
    next()
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.roleSlug) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    if (!hasPermission(req.roleSlug, permission)) {
      return res.status(403).json({ ok: false, error: 'forbidden', permission })
    }
    next()
  }
}

export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.roleSlug) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    const ok = permissions.some(p => hasPermission(req.roleSlug, p))
    if (!ok) {
      return res.status(403).json({ ok: false, error: 'forbidden' })
    }
    next()
  }
}
