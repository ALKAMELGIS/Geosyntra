import { randomBytes } from 'crypto'
import { createAuthDirectoryStore } from './authDirectoryStore.js'

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/)
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * @param {import('express').Express} app
 * @param {{
 *   jsonFilePath: string
 *   sqlitePath?: string
 *   appOrigin: string
 *   appBasePath: string
 *   hasSmtpConfig: () => boolean
 *   sendMail: (opts: { to: string; subject: string; text: string; html: string }) => Promise<void>
 *   addAuthEvent: (action: string, payload?: object) => void
 * }} deps
 */
export function registerAuthRoutes(app, deps) {
  const store = createAuthDirectoryStore({
    jsonFilePath: deps.jsonFilePath,
    sqlitePath: deps.sqlitePath,
  })

  function verificationLink(token) {
    const origin = String(deps.appOrigin || '').replace(/\/+$/, '')
    const base = String(deps.appBasePath || '/').replace(/\/?$/, '/')
    const path = `${origin}${base === '/' ? '' : base}`
    return `${path}#/app/auth/verify-email?token=${encodeURIComponent(token)}`
  }

  async function sendVerificationEmail(email, token) {
    const link = verificationLink(token)
    const appName = 'GeoSyntra'
    const subject = `${appName} — Verify your email`
    const text = [
      `Welcome to ${appName}.`,
      '',
      'Please verify your email by opening this link:',
      link,
      '',
      'If you did not create an account, you can ignore this email.',
    ].join('\n')
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:520px">
        <h2 style="margin:0 0 12px;font-size:22px">Verify your email</h2>
        <p style="margin:0 0 16px;color:#334155">Confirm your address to activate your GeoSyntra workspace.</p>
        <p style="margin:0 0 20px">
          <a href="${link}" style="display:inline-block;padding:12px 22px;background:#0f172a;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Verify Email</a>
        </p>
        <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all">${link}</p>
      </div>
    `
    await deps.sendMail({ to: email, subject, text, html })
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
      const result = store.registerUser({
        name,
        email,
        password,
        profileExtra: { firstName, lastName },
      })
      if (!result.ok) {
        if (result.error === 'email_exists') {
          return res.status(409).json({ ok: false, error: 'email_exists' })
        }
        return res.status(400).json({ ok: false, error: result.error || 'register_failed' })
      }

      const token = result.verificationToken
      const payload = {
        ok: true,
        needsVerification: true,
        email: result.user.email,
        smtpConfigured: deps.hasSmtpConfig(),
      }

      if (deps.hasSmtpConfig()) {
        try {
          await sendVerificationEmail(result.user.email, token)
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
        deps.addAuthEvent('register_smtp_missing', { email: result.user.email })
        return res.status(503).json({
          ok: false,
          error: 'smtp_not_configured',
          message: 'Email verification is not available. Configure SMTP on the server.',
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
      const user = store.getUserByEmail(email)
      if (!user) {
        return res.json({ ok: true, message: 'If an account exists, a verification email was sent.' })
      }
      if (user.emailVerified) {
        return res.status(400).json({ ok: false, error: 'already_verified' })
      }
      const token = randomBytes(32).toString('hex')
      const set = store.setVerificationToken(email, token)
      if (!set.ok) return res.status(404).json({ ok: false, error: 'not_found' })

      if (!deps.hasSmtpConfig()) {
        if (process.env.NODE_ENV !== 'production') {
          return res.json({ ok: true, devVerificationLink: verificationLink(token), smtpConfigured: false })
        }
        return res.status(503).json({ ok: false, error: 'smtp_not_configured' })
      }
      await sendVerificationEmail(email, token)
      deps.addAuthEvent('verification_resent', { email })
      return res.json({ ok: true, smtpConfigured: true })
    } catch (e) {
      const message = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : 'send_failed'
      return res.status(502).json({ ok: false, error: 'verification_email_failed', details: message })
    }
  })

  app.get('/api/auth/verify-email', (req, res) => {
    try {
      const token = String(req.query?.token || '').trim()
      if (!token) return res.status(400).json({ ok: false, error: 'token_required' })
      const result = store.verifyEmailByToken(token)
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.error || 'invalid_token' })
      }
      deps.addAuthEvent('email_verified', { email: result.publicUser.email })
      return res.json({ ok: true, user: result.publicUser })
    } catch (e) {
      console.error('[auth] verify-email failed', e)
      return res.status(500).json({ ok: false, error: 'verify_failed' })
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
        return res.status(401).json({ ok: false, error: 'invalid_credentials' })
      }
      deps.addAuthEvent('login_success', { email: result.publicUser.email })
      return res.json({ ok: true, user: result.publicUser })
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
      if (!email || (provider !== 'google' && provider !== 'apple')) {
        return res.status(400).json({ ok: false, error: 'invalid_oauth_payload' })
      }
      const result = store.upsertOAuthUser({ email, name, provider, sub: sub || undefined })
      if (!result.ok) return res.status(400).json({ ok: false, error: result.error })
      deps.addAuthEvent('oauth_login', { email: result.publicUser.email, provider })
      return res.json({ ok: true, user: result.publicUser })
    } catch (e) {
      console.error('[auth] oauth-upsert failed', e)
      return res.status(500).json({ ok: false, error: 'oauth_failed' })
    }
  })
}
