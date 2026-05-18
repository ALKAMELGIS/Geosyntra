import { createInviteStore } from './rbac/inviteStore.js'
import { createAuthMiddleware, requirePermission } from './rbac/middleware.js'
import { PERMISSIONS, permissionsMatrixExport } from './rbac/permissions.js'
import { canAssignRole, displayRoleToSlug, normalizeRbacRole, rbacRoleToDisplay } from './rbac/roles.js'
import { issueAuthResponse } from './rbac/authTokens.js'
import { toPublicAuthUser } from './rbac/userPublic.js'
import { sendAuthEmail, hasEmailConfig } from './authEmail.js'

function inviteLink(deps, token) {
  const origin = String(deps.appOrigin || '').replace(/\/+$/, '')
  const base = String(deps.appBasePath || '/').replace(/\/?$/, '/')
  const path = `${origin}${base === '/' ? '' : base}`
  return `${path}#/join-team?token=${encodeURIComponent(token)}`
}

async function sendInviteEmail(deps, { email, token, roleDisplay, invitedByName }) {
  const link = inviteLink(deps, token)
  const appName = 'GeoSyntra'
  const subject = `${appName} — Team invitation (${roleDisplay})`
  const text = [
    `${invitedByName || 'An administrator'} invited you to join ${appName} as ${roleDisplay}.`,
    '',
    'Accept your invitation and set your password:',
    link,
    '',
    'This link expires in 72 hours.',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:520px">
      <h2 style="margin:0 0 12px;font-size:22px">You're invited</h2>
      <p style="margin:0 0 16px;color:#334155">
        ${invitedByName || 'An administrator'} invited you to join <strong>${appName}</strong> as <strong>${roleDisplay}</strong>.
      </p>
      <p style="margin:0 0 20px">
        <a href="${link}" style="display:inline-block;padding:12px 22px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Join team</a>
      </p>
      <p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all">${link}</p>
    </motion.div>
  `
    .replace(/<motion\.div/g, '<div')
    .replace(/<\/motion\.div>/g, '</motion.div>')
    .replace(/motion\.motion/g, 'motion')
  await sendAuthEmail({ to: email, subject, text, html })
  return link
}

/**
 * @param {import('express').Express} app
 * @param {{
 *   store: ReturnType<import('./authDirectoryStore.js').createAuthDirectoryStore>
 *   sqlitePath?: string
 *   appOrigin: string
 *   appBasePath: string
 *   addAuthEvent: (action: string, payload?: object) => void
 * }} deps
 */
export function registerRbacRoutes(app, deps) {
  const store = deps.store
  const invites = createInviteStore(deps.sqlitePath)
  const requireAuth = createAuthMiddleware(() => store)

  app.get('/api/rbac/me', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      user: req.authPublic,
      accessToken: req.accessToken,
    })
  })

  app.get('/api/rbac/permissions/matrix', requireAuth, requirePermission(PERMISSIONS.ADMIN_PANEL), (_req, res) => {
    return res.json({ ok: true, matrix: permissionsMatrixExport() })
  })

  app.get('/api/rbac/users', requireAuth, requirePermission(PERMISSIONS.USERS_READ), (_req, res) => {
    const users = store.listUsers().map(u => toPublicAuthUser(u))
    return res.json({ ok: true, users })
  })

  app.get('/api/rbac/audit', requireAuth, requirePermission(PERMISSIONS.AUDIT_READ), (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 100))
    return res.json({ ok: true, audit: store.getAuditLog(limit) })
  })

  app.post('/api/rbac/users/:id/approve', requireAuth, requirePermission(PERMISSIONS.USERS_APPROVE), (req, res) => {
    const id = Number(req.params.id)
    const result = store.approveUser(id, req.authUser)
    if (!result?.ok) return res.status(result?.error === 'not_found' ? 404 : 400).json(result)
    deps.addAuthEvent('rbac_user_approved', { targetId: id, by: req.authUser.email })
    return res.json({ ok: true })
  })

  app.post('/api/rbac/users/:id/suspend', requireAuth, requirePermission(PERMISSIONS.USERS_SUSPEND), (req, res) => {
    const id = Number(req.params.id)
    const result = store.suspendUser(id, req.authUser)
    if (!result?.ok) return res.status(result?.error === 'not_found' ? 404 : 400).json(result)
    deps.addAuthEvent('rbac_user_suspended', { targetId: id, by: req.authUser.email })
    return res.json({ ok: true })
  })

  app.post('/api/rbac/users/:id/reactivate', requireAuth, requirePermission(PERMISSIONS.USERS_SUSPEND), (req, res) => {
    const id = Number(req.params.id)
    const result = store.reactivateUser(id, req.authUser)
    if (!result?.ok) return res.status(result?.error === 'not_found' ? 404 : 400).json(result)
    return res.json({ ok: true })
  })

  app.patch('/api/rbac/users/:id', requireAuth, requirePermission(PERMISSIONS.ROLES_ASSIGN), (req, res) => {
    const id = Number(req.params.id)
    const roleSlug = req.body?.roleSlug ?? req.body?.role
    if (!roleSlug) return res.status(400).json({ ok: false, error: 'role_required' })
    if (Number(id) === Number(req.authUser.id)) {
      return res.status(400).json({ ok: false, error: 'cannot_change_own_role' })
    }
    const actor = { ...req.authUser, roleSlug: req.roleSlug }
    const result = store.setUserRole(id, roleSlug, actor)
    if (!result?.ok) {
      const status = result?.error === 'forbidden_role_assignment' ? 403 : result?.error === 'not_found' ? 404 : 400
      return res.status(status).json(result)
    }
    deps.addAuthEvent('rbac_role_changed', { targetId: id, role: roleSlug, by: req.authUser.email })
    return res.json({ ok: true, user: toPublicAuthUser(result.user) })
  })

  app.get('/api/rbac/invites', requireAuth, requirePermission(PERMISSIONS.INVITES_CREATE), (_req, res) => {
    return res.json({ ok: true, invites: invites.list(100) })
  })

  app.post('/api/rbac/invites', requireAuth, requirePermission(PERMISSIONS.INVITES_CREATE), async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim()
      const roleSlug = normalizeRbacRole(req.body?.roleSlug ?? req.body?.role ?? 'manager')
      if (!email) return res.status(400).json({ ok: false, error: 'email_required' })
      if (!canAssignRole(req.roleSlug, roleSlug)) {
        return res.status(403).json({ ok: false, error: 'forbidden_role_assignment' })
      }
      const existing = store.getUserByEmail(email)
      if (existing) {
        return res.status(409).json({ ok: false, error: 'email_exists' })
      }
      const created = invites.createInvite({
        email,
        role: roleSlug,
        invitedById: req.authUser.id,
        invitedByEmail: req.authUser.email,
      })
      const displayRole = rbacRoleToDisplay(roleSlug)
      const payload = {
        ok: true,
        invite: {
          email: created.email,
          role: displayRole,
          roleSlug,
          expiresAt: created.expiresAt,
        },
      }
      if (hasEmailConfig()) {
        await sendInviteEmail(deps, {
          email,
          token: created.token,
          roleDisplay: displayRole,
          invitedByName: req.authUser.name,
        })
        deps.addAuthEvent('rbac_invite_sent', { email, role: roleSlug })
      } else if (process.env.NODE_ENV !== 'production') {
        payload.devInviteLink = inviteLink(deps, created.token)
      } else {
        return res.status(503).json({ ok: false, error: 'email_not_configured' })
      }
      return res.status(201).json(payload)
    } catch (e) {
      console.error('[rbac] invite failed', e)
      return res.status(500).json({ ok: false, error: 'invite_failed' })
    }
  })

  app.get('/api/rbac/invites/preview', (req, res) => {
    const token = String(req.query?.token || '').trim()
    if (!token) return res.status(400).json({ ok: false, error: 'token_required' })
    const invite = invites.getByToken(token)
    if (!invite) return res.status(404).json({ ok: false, error: 'invalid_invite' })
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ ok: false, error: 'invite_expired' })
    }
    return res.json({
      ok: true,
      invite: {
        email: invite.email,
        role: invite.role,
        roleSlug: invite.roleSlug,
        expiresAt: invite.expiresAt,
      },
    })
  })

  app.post('/api/rbac/invites/accept', async (req, res) => {
    try {
      const token = String(req.body?.token || '').trim()
      const name = String(req.body?.name || '').trim()
      const password = String(req.body?.password || '')
      if (!token || !password || password.length < 8) {
        return res.status(400).json({ ok: false, error: 'invalid_payload' })
      }
      const accepted = invites.acceptInvite(token)
      if (!accepted.ok) {
        const status = accepted.error === 'invite_expired' ? 410 : 404
        return res.status(status).json({ ok: false, error: accepted.error })
      }
      const invite = accepted.invite
      if (store.getUserByEmail(invite.email)) {
        return res.status(409).json({ ok: false, error: 'email_exists' })
      }
      const created = store.createInvitedUser({
        email: invite.email,
        name: name || invite.email,
        password,
        roleDisplay: invite.role,
        invitedByEmail: invite.invitedByEmail,
      })
      if (!created?.ok) {
        return res.status(400).json(created)
      }
      const { publicUser, accessToken } = issueAuthResponse(created.user)
      deps.addAuthEvent('rbac_invite_accepted', { email: invite.email, role: invite.role })
      return res.json({ ok: true, user: publicUser, accessToken })
    } catch (e) {
      console.error('[rbac] accept invite failed', e)
      return res.status(500).json({ ok: false, error: 'accept_failed' })
    }
  })
}
