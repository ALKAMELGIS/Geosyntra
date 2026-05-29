import { createAuthDirectoryStore } from './authDirectoryStore.js'
import { createAuthMiddleware } from './rbac/middleware.js'
import { normalizeRbacRole } from './rbac/roles.js'
import { issueAuthResponse } from './rbac/authTokens.js'
import {
  clearAuthCookies,
  readRefreshTokenFromRequest,
  setAccessTokenCookie,
  setRefreshTokenCookie,
} from './rbac/authCookies.js'
import { createRefreshTokenStore } from './rbac/refreshTokens.js'
import { verifyRefreshToken } from './rbac/refreshTokens.js'
import { signAccessToken } from './rbac/jwt.js'
import { authRateLimiter } from './middleware/authRateLimit.js'
import { sendAuthEmail, hasEmailConfig } from './authEmail.js'
import {
  generateVerificationToken,
  checkResendCooldown,
  checkPasswordResetCooldown,
  markResendSent,
  markPasswordResetSent,
  passwordResetExpiresAt,
  verificationExpiresAt,
} from './authVerification.js'

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/)
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function isOwnerRole(req) {
  const slug = normalizeRbacRole(req.roleSlug || '')
  return slug === 'owner' || slug === 'super_admin'
}

function requireOwner(req, res, next) {
  if (!isOwnerRole(req)) {
    return res.status(403).json({
      ok: false,
      error: 'owner_required',
      message: 'Only the platform Owner can provision sign-in accounts.',
    })
  }
  next()
}

function matchesAdminDirectoryToken(req) {
  const token = String(process.env.AGRI_ADMIN_DIRECTORY_TOKEN || '').trim()
  if (!token) return false
  const hdr = String(req.headers['x-agri-admin-directory-token'] || '').trim()
  const auth = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  return hdr === token || auth === token
}

/**
 * @param {import('express').Express} app
 * @param {{
 *   jsonFilePath: string
 *   sqlitePath?: string
 *   appOrigin: string
 *   appBasePath: string
 *   addAuthEvent: (action: string, payload?: object) => void
 *   store?: ReturnType<typeof createAuthDirectoryStore>
 * }} deps
 */
export function registerAuthRoutes(app, deps) {
  const store =
    deps.store ??
    createAuthDirectoryStore({
      jsonFilePath: deps.jsonFilePath,
      sqlitePath: deps.sqlitePath,
    })

  const requireAuth = createAuthMiddleware(() => store)
  const refreshStore = createRefreshTokenStore(deps.sqliteDb || store.sqliteDb || null)

  app.use('/api/auth', authRateLimiter)

  function sendAuthSuccess(res, user, { remember = true, req } = {}) {
    const { publicUser, accessToken, refreshToken } = issueAuthResponse(user)
    setAccessTokenCookie(res, accessToken)
    if (remember) {
      setRefreshTokenCookie(res, refreshToken)
      refreshStore.persist(user.id, refreshToken, req?.headers?.['user-agent'])
    }
    return { publicUser, accessToken, refreshToken }
  }

  app.get('/api/auth/me', requireAuth, (req, res) => {
    return res.json({ ok: true, user: req.authPublic })
  })

  app.post('/api/auth/refresh', (req, res) => {
    try {
      const token = readRefreshTokenFromRequest(req)
      if (!token) return res.status(401).json({ ok: false, error: 'refresh_missing' })
      if (refreshStore.isRevoked(token)) {
        return res.status(401).json({ ok: false, error: 'refresh_revoked' })
      }
      const verified = verifyRefreshToken(token)
      if (!verified.ok) return res.status(401).json({ ok: false, error: verified.error || 'invalid_refresh' })
      const userId = Number(verified.payload.sub)
      const user = store.getUserById?.(userId) || null
      if (!user) return res.status(401).json({ ok: false, error: 'user_not_found' })
      const { publicUser, accessToken, refreshToken } = issueAuthResponse(user)
      setAccessTokenCookie(res, accessToken)
      setRefreshTokenCookie(res, refreshToken)
      refreshStore.revoke(token)
      refreshStore.persist(user.id, refreshToken, req.headers['user-agent'])
      return res.json({ ok: true, user: publicUser, accessToken })
    } catch (e) {
      console.error('[auth] refresh failed', e)
      return res.status(500).json({ ok: false, error: 'refresh_failed' })
    }
  })

  app.post('/api/auth/logout', (req, res) => {
    const token = readRefreshTokenFromRequest(req)
    if (token) refreshStore.revoke(token)
    clearAuthCookies(res)
    return res.json({ ok: true })
  })

  function requireOwnerOrDirectoryToken(req, res, next) {
    if (matchesAdminDirectoryToken(req)) return next()
    return requireAuth(req, res, () => requireOwner(req, res, next))
  }

  function spaHashPath(route) {
    const origin = String(deps.appOrigin || '').replace(/\/+$/, '')
    const base = String(deps.appBasePath || '/').replace(/\/?$/, '/')
    return `${origin}${base === '/' ? '' : base}#${route}`
  }

  function verificationLink(token) {
    return `${spaHashPath('/app/auth/verify-email')}?token=${encodeURIComponent(token)}`
  }

  function passwordResetLink(token) {
    return `${spaHashPath('/app/auth/reset-password')}?token=${encodeURIComponent(token)}`
  }

  async function sendVerificationEmail(email, token) {
    const link = verificationLink(token)
    const appName = 'GeoSyntra'
    const subject = `${appName} — Confirm your account`
    const text = [
      `Welcome to ${appName}.`,
      '',
      'Click the link below to verify your account (valid for 1 hour):',
      link,
      '',
      'If you did not create an account, you can ignore this email.',
    ].join('\n')
    const html = `
      <motion.div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:520px">
        <h2 style="margin:0 0 12px;font-size:22px">Welcome 👋</h2>
        <p style="margin:0 0 16px;color:#334155">Click below to verify your account and activate your workspace.</p>
        <p style="margin:0 0 20px">
          <a href="${link}" style="display:inline-block;padding:12px 22px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Verify Account</a>
        </p>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b">This link expires in 1 hour.</p>
        <p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all">${link}</p>
      </motion.div>
    `.replace(/<motion\.div/g, '<motion.div').replace(/<\/motion\.motion.div>/g, '</motion.div>').replace('motion.div', 'motion.div').replace(/motion\.motion/g, 'motion')
    const htmlFixed = html
      .replace(/<motion\.div/g, '<div')
      .replace(/<\/motion\.motion\.motion\.div>/g, '</div>')
      .replace(/<\/motion\.div>/g, '</motion.div>')
      .replace(/motion\.div/g, 'div')
      .replace(/<\/motion\.div>/g, '</div>')
    const cleanHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:520px">
        <h2 style="margin:0 0 12px;font-size:22px">Welcome</h2>
        <p style="margin:0 0 16px;color:#334155">Click below to verify your account and activate your workspace.</p>
        <p style="margin:0 0 20px">
          <a href="${link}" style="display:inline-block;padding:12px 22px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Verify Account</a>
        </p>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b">This link expires in 1 hour.</p>
        <p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all">${link}</p>
      </div>
    `
    await sendAuthEmail({ to: email, subject, text, html: cleanHtml })
    return link
  }

  app.post('/api/auth/register', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim()
      const email = String(req.body?.email || '').trim()
      const password = String(req.body?.password || '')
      if (!name) return res.status(400).json({ ok: false, error: 'name_required' })
      if (!email || !password || password.length < 6) {
        return res.status(400).json({ ok: false, error: 'invalid_credentials' })
      }
      const { firstName, lastName } = splitName(name)
      const requestedPlan = req.body?.planId ?? req.body?.plan ?? req.body?.subscriptionPlan ?? 'trial'
      const result = store.registerUser({
        name,
        email,
        password,
        requestedPlan,
        profileExtra: { firstName, lastName },
      })
      if (!result.ok && result.error === 'role_not_self_assignable') {
        return res.status(403).json({
          ok: false,
          error: 'role_not_self_assignable',
          message: 'Owner and Admin roles cannot be selected during sign up. Choose another role or contact your administrator.',
        })
      }
      if (!result.ok) {
        if (result.error === 'email_exists') {
          const existing = store.getUserByEmail(email)
          if (existing && !existing.emailVerified) {
            return res.status(409).json({
              ok: false,
              error: 'email_exists_unverified',
              message: 'An account with this email is awaiting verification. Resend the email or sign in after verifying.',
            })
          }
          return res.status(409).json({ ok: false, error: 'email_exists' })
        }
        return res.status(400).json({ ok: false, error: result.error || 'register_failed' })
      }

      const token = result.verificationToken
      const payload = {
        ok: true,
        needsVerification: true,
        email: result.user.email,
        emailConfigured: hasEmailConfig(),
      }

      if (hasEmailConfig()) {
        try {
          await sendVerificationEmail(result.user.email, token)
          markResendSent(result.user.email)
          deps.addAuthEvent('register_verification_sent', { email: result.user.email })
        } catch (e) {
          const message = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : 'send_failed'
          deps.addAuthEvent('register_verification_failed', { email: result.user.email, reason: message })
          return res.status(502).json({ ok: false, error: 'verification_email_failed', details: message })
        }
      } else if (process.env.NODE_ENV !== 'production') {
        payload.devVerificationLink = verificationLink(token)
        deps.addAuthEvent('register_dev_link_only', { email: result.user.email })
      } else {
        deps.addAuthEvent('register_email_missing', { email: result.user.email })
        return res.status(503).json({
          ok: false,
          error: 'email_not_configured',
          message: 'Email verification is not available. Configure RESEND_API_KEY or SMTP on the server.',
        })
      }

      return res.status(201).json(payload)
    } catch (e) {
      console.error('[auth] register failed', e)
      return res.status(500).json({ ok: false, error: 'register_failed' })
    }
  })

  app.post('/api/auth/resend-verification', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim()
      if (!email) return res.status(400).json({ ok: false, error: 'email_required' })

      const cooldown = checkResendCooldown(email)
      if (!cooldown.ok) {
        return res.status(429).json({
          ok: false,
          error: 'resend_cooldown',
          retryAfterSec: cooldown.retryAfterSec,
          message: `Please wait ${cooldown.retryAfterSec}s before resending.`,
        })
      }

      const user = store.getUserByEmail(email)
      if (!user) {
        return res.json({ ok: true, message: 'If an account exists, a verification email was sent.' })
      }
      if (user.emailVerified) {
        return res.status(400).json({ ok: false, error: 'already_verified' })
      }

      const token = generateVerificationToken()
      const expires = verificationExpiresAt()
      const set = store.setVerificationToken(email, token, expires)
      if (!set.ok) return res.status(404).json({ ok: false, error: 'not_found' })

      if (!hasEmailConfig()) {
        if (process.env.NODE_ENV !== 'production') {
          return res.json({
            ok: true,
            devVerificationLink: verificationLink(token),
            emailConfigured: false,
          })
        }
        return res.status(503).json({ ok: false, error: 'email_not_configured' })
      }

      await sendVerificationEmail(email, token)
      markResendSent(email)
      deps.addAuthEvent('verification_resent', { email })
      return res.json({ ok: true, emailConfigured: true })
    } catch (e) {
      const message = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : 'send_failed'
      return res.status(502).json({ ok: false, error: 'verification_email_failed', details: message })
    }
  })

  async function sendPasswordResetEmail(email, token) {
    const link = passwordResetLink(token)
    const appName = 'GeoSyntra'
    const subject = `${appName} — Reset your password`
    const text = [
      `You requested a password reset for ${appName}.`,
      '',
      'Click the link below to choose a new password (valid for 1 hour):',
      link,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n')
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:520px">
        <h2 style="margin:0 0 12px;font-size:22px">Reset your password</h2>
        <p style="margin:0 0 16px;color:#334155">Click below to set a new password for your GeoSyntra account.</p>
        <p style="margin:0 0 20px">
          <a href="${link}" style="display:inline-block;padding:12px 22px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Reset password</a>
        </p>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b">This link expires in 1 hour.</p>
        <p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all">${link}</p>
      </div>
    `
    await sendAuthEmail({ to: email, subject, text, html })
    return link
  }

  app.post('/api/auth/forgot-username', (req, res) => {
    try {
      const email = String(req.body?.email || '').trim()
      if (!email || !email.includes('@')) {
        return res.status(400).json({ ok: false, error: 'email_required', message: 'Enter a valid email address.' })
      }
      const hint = store.lookupUsernameHint(email)
      if (!hint?.ok) {
        return res.json({
          ok: true,
          found: false,
          message:
            'No GeoSyntra account was found for this email. Check the spelling or sign up for a new workspace.',
        })
      }
      if (hint.oauthOnly) {
        const providers = hint.oauthProviders?.length ? hint.oauthProviders.join(', ') : 'social sign-in'
        return res.json({
          ok: true,
          found: true,
          signInId: hint.signInId,
          username: hint.username,
          oauthOnly: true,
          message: `This account uses ${providers} only (no password). Sign in with the same provider you used when registering.`,
        })
      }
      const userLabel = hint.username !== hint.signInId ? hint.username : hint.signInId
      return res.json({
        ok: true,
        found: true,
        signInId: hint.signInId,
        username: hint.username,
        message: `Sign in with email ${hint.signInId}${userLabel !== hint.signInId ? ` (display name: ${userLabel})` : ''}.`,
      })
    } catch (e) {
      console.error('[auth] forgot-username failed', e)
      return res.status(500).json({ ok: false, error: 'lookup_failed' })
    }
  })

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim()
      if (!email || !email.includes('@')) {
        return res.status(400).json({ ok: false, error: 'email_required', message: 'Enter a valid email address.' })
      }

      const cooldown = checkPasswordResetCooldown(email)
      if (!cooldown.ok) {
        return res.status(429).json({
          ok: false,
          error: 'reset_cooldown',
          retryAfterSec: cooldown.retryAfterSec,
          message: `Please wait ${cooldown.retryAfterSec}s before requesting another reset email.`,
        })
      }

      const user = store.getUserByEmail(email)
      const generic = {
        ok: true,
        message: 'If an account exists for this email, password reset instructions were sent.',
      }
      if (!user) return res.json(generic)
      if (!String(user.passwordHash || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'oauth_only',
          message:
            'This account uses social sign-in only. Use Google, LinkedIn, or GitHub on the sign-in screen instead.',
        })
      }

      const token = generateVerificationToken()
      const expires = passwordResetExpiresAt()
      const set = store.setPasswordResetToken(email, token, expires)
      if (!set.ok) return res.json(generic)

      if (!hasEmailConfig()) {
        if (process.env.NODE_ENV !== 'production') {
          deps.addAuthEvent('password_reset_dev_link', { email: String(email).trim().toLowerCase() })
          return res.json({
            ok: true,
            message: 'Development mode: use the reset link below.',
            devResetLink: passwordResetLink(token),
            emailConfigured: false,
          })
        }
        return res.status(503).json({
          ok: false,
          error: 'email_not_configured',
          message: 'Password reset email is not configured on the server. Contact support.',
        })
      }

      await sendPasswordResetEmail(user.email, token)
      markPasswordResetSent(email)
      deps.addAuthEvent('password_reset_sent', { email: user.email })
      return res.json({ ok: true, message: 'Password reset email sent. Check your inbox.', emailConfigured: true })
    } catch (e) {
      const message = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : 'send_failed'
      return res.status(502).json({ ok: false, error: 'reset_email_failed', details: message })
    }
  })

  app.post('/api/auth/reset-password', (req, res) => {
    try {
      const token = String(req.body?.token || '').trim()
      const password = String(req.body?.password || '')
      if (!token) return res.status(400).json({ ok: false, error: 'token_required' })
      if (!password || password.length < 8) {
        return res.status(400).json({
          ok: false,
          error: 'password_too_short',
          message: 'Password must be at least 8 characters.',
        })
      }
      const result = store.resetPasswordByToken(token, password)
      if (!result.ok) {
        const code = result.error === 'token_expired' ? 'token_expired' : 'invalid_token'
        return res.status(400).json({
          ok: false,
          error: code,
          message:
            code === 'token_expired'
              ? 'This reset link has expired. Request a new password reset email.'
              : 'This reset link is invalid.',
        })
      }
      deps.addAuthEvent('password_reset_completed', { email: result.email })
      return res.json({ ok: true, message: 'Password updated. You can sign in with your new password.' })
    } catch (e) {
      console.error('[auth] reset-password failed', e)
      return res.status(500).json({ ok: false, error: 'reset_failed' })
    }
  })

  app.get('/api/auth/verify-email', (req, res) => {
    try {
      const token = String(req.query?.token || '').trim()
      if (!token) return res.status(400).json({ ok: false, error: 'token_required' })
      const result = store.verifyEmailByToken(token)
      if (!result.ok) {
        const code = result.error === 'token_expired' ? 'token_expired' : 'invalid_token'
        return res.status(400).json({
          ok: false,
          error: code,
          message:
            code === 'token_expired'
              ? 'This verification link has expired. Request a new email.'
              : 'This verification link is invalid.',
        })
      }
      deps.addAuthEvent('email_verified', { email: result.publicUser.email })
      const { publicUser, accessToken } = sendAuthSuccess(res, result.user, { req })
      return res.json({
        ok: true,
        user: publicUser,
        accessToken,
        pendingApproval: publicUser.status === 'Pending Approval',
      })
    } catch (e) {
      console.error('[auth] verify-email failed', e)
      return res.status(500).json({ ok: false, error: 'verify_failed' })
    }
  })

  app.post('/api/auth/admin/provision-user', requireOwnerOrDirectoryToken, (req, res) => {
    try {
      const name = String(req.body?.name || '').trim()
      const email = String(req.body?.email || '').trim()
      const password = String(req.body?.password || '')
      const role = String(req.body?.role || 'Viewer').trim() || 'Viewer'
      const status = String(req.body?.status || 'Active').trim() || 'Active'
      const emailVerified = req.body?.emailVerified !== false
      const profileExtra =
        req.body?.profileExtra && typeof req.body.profileExtra === 'object' ? req.body.profileExtra : undefined
      if (!email || !password || password.length < 8) {
        return res.status(400).json({ ok: false, error: 'invalid_input', message: 'Email and password (min 8 characters) are required.' })
      }
      const provisionedBy = req.authUser?.email ?? req.body?.provisionedBy ?? null
      const result = store.provisionUserByOwner({
        name,
        email,
        password,
        role,
        status,
        emailVerified,
        profileExtra,
        provisionedBy,
      })
      if (!result.ok) {
        if (result.error === 'email_exists' && req.body?.ensureSignIn === true) {
          const repaired = store.ensureOwnerProvisionedSignIn({
            email,
            password,
            status,
            emailVerified,
            provisionedBy,
          })
          if (repaired.ok) {
            deps.addAuthEvent('owner_provision_repair', { email: repaired.user.email })
            return res.json({ ok: true, user: repaired.publicUser, repaired: true })
          }
          if (repaired.error === 'not_found') {
            return res.status(404).json({ ok: false, error: 'not_found', message: 'User not found on auth server.' })
          }
        }
        if (result.error === 'email_exists') {
          return res.status(409).json({ ok: false, error: 'email_exists', message: 'An account with this email already exists.' })
        }
        if (result.error === 'password_too_short') {
          return res.status(400).json({ ok: false, error: 'password_too_short', message: 'Password must be at least 8 characters.' })
        }
        return res.status(400).json({ ok: false, error: result.error || 'provision_failed' })
      }
      deps.addAuthEvent('owner_provision', { email: result.user.email, role: result.user.role })
      return res.status(201).json({ ok: true, user: result.publicUser })
    } catch (e) {
      console.error('[auth] provision-user failed', e)
      return res.status(500).json({ ok: false, error: 'provision_failed' })
    }
  })

  app.post('/api/auth/login', (req, res) => {
    try {
      const email = String(req.body?.email || '').trim()
      const password = String(req.body?.password || '')
      if (!email || !password) {
        return res.status(400).json({ ok: false, error: 'invalid_credentials' })
      }
      const result = store.loginUser(email, password)
      if (!result.ok) {
        if (result.error === 'email_not_verified') {
          return res.status(403).json({
            ok: false,
            error: 'email_not_verified',
            message: 'Please verify your email before accessing GeoSyntra.',
          })
        }
        if (result.error === 'pending_approval') {
          return res.status(403).json({
            ok: false,
            error: 'pending_approval',
            message: result.message || 'Your account is awaiting administrator approval.',
          })
        }
        if (result.error === 'account_suspended') {
          return res.status(403).json({ ok: false, error: 'account_suspended' })
        }
        if (result.error === 'user_not_found') {
          return res.status(401).json({
            ok: false,
            error: 'user_not_found',
            message:
              'No sign-in account on the server for this email. Your administrator can enable cross-device sign-in from User Management.',
          })
        }
        if (result.error === 'auth_incomplete') {
          return res.status(403).json({
            ok: false,
            error: 'auth_incomplete',
            message: result.message || 'Account exists but is not activated for sign-in. Contact your administrator.',
          })
        }
        if (result.error === 'invalid_password') {
          return res.status(401).json({
            ok: false,
            error: 'invalid_password',
            message: 'Incorrect password.',
          })
        }
        return res.status(401).json({ ok: false, error: 'invalid_credentials', message: 'Incorrect email or password.' })
      }
      const { publicUser, accessToken } = sendAuthSuccess(res, result.user, { req })
      deps.addAuthEvent('login_success', { email: publicUser.email })
      return res.json({ ok: true, user: publicUser, accessToken })
    } catch (e) {
      console.error('[auth] login failed', e)
      return res.status(500).json({ ok: false, error: 'login_failed' })
    }
  })

  app.post('/api/auth/oauth-upsert', (req, res) => {
    try {
      const email = String(req.body?.email || '').trim()
      const name = String(req.body?.name || '').trim()
      const provider = String(req.body?.provider || '').trim()
      const sub = String(req.body?.sub || '').trim()
      const username = String(req.body?.username || '').trim()
      const profileImage = String(req.body?.profile_image || req.body?.profileImage || '').trim()
      const remember = req.body?.remember !== false
      if (
        !email ||
        !['google', 'apple', 'github', 'linkedin'].includes(provider)
      ) {
        return res.status(400).json({ ok: false, error: 'invalid_oauth_payload' })
      }
      const result = store.upsertOAuthUser({
        email,
        name,
        provider,
        sub: sub || undefined,
        username: username || undefined,
        profileImage: profileImage || undefined,
      })
      if (!result.ok) {
        if (result.error === 'pending_approval') {
          return res.status(403).json({
            ok: false,
            error: 'pending_approval',
            message: result.message,
          })
        }
        return res.status(400).json({ ok: false, error: result.error })
      }
      if (result.error === 'oauth_email_conflict' || result.error === 'oauth_provider_conflict') {
        return res.status(409).json({
          ok: false,
          error: result.error,
          message: result.message,
        })
      }
      const { publicUser, accessToken } = sendAuthSuccess(res, result.user, { remember, req })
      deps.addAuthEvent('oauth_login', { email: publicUser.email, provider })
      return res.json({
        ok: true,
        user: publicUser,
        accessToken,
        pendingApproval: Boolean(result.pendingApproval),
      })
    } catch (e) {
      console.error('[auth] oauth-upsert failed', e)
      return res.status(500).json({ ok: false, error: 'oauth_failed' })
    }
  })

  return { store }
}
