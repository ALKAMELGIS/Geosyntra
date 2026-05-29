import session from 'express-session'
import passport from 'passport'
import { configurePassport } from './oauth/passportSetup.js'
import {
  isProviderConfigured,
  oauthErrorRedirect,
  oauthSuccessRedirect,
  sessionSecret,
} from './oauth/oauthConfig.js'
import { issueAuthResponse } from './rbac/authTokens.js'
import {
  clearAuthCookies,
  setAccessTokenCookie,
  setRefreshTokenCookie,
} from './rbac/authCookies.js'
import { createRefreshTokenStore } from './rbac/refreshTokens.js'

/**
 * @param {import('express').Express} app
 * @param {{
 *   store: import('./authDirectoryStore.js').createAuthDirectoryStore extends Function ? ReturnType<typeof import('./authDirectoryStore.js').createAuthDirectoryStore> : object
 *   sqliteDb?: import('better-sqlite3').Database | null
 *   addAuthEvent: (action: string, payload?: object) => void
 * }} deps
 */
export function registerPassportOAuthRoutes(app, deps) {
  const refreshStore = createRefreshTokenStore(deps.sqliteDb || null)

  configurePassport({
    async onOAuthProfile(profile) {
      const result = deps.store.upsertOAuthUser(profile)
      if (!result.ok) return result
      return { ok: true, user: result.user }
    },
  })

  app.use(
    session({
      name: 'geosyntra_oauth',
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
      },
    }),
  )
  app.use(passport.initialize())
  app.use(passport.session())

  function finishOAuth(req, res, user, remember) {
    if (!user?.id) {
      return res.redirect(oauthErrorRedirect('oauth_user_missing'))
    }
    const { publicUser, accessToken, refreshToken } = issueAuthResponse(user)
    setAccessTokenCookie(res, accessToken)
    if (remember !== false) setRefreshTokenCookie(res, refreshToken)
    refreshStore.persist(user.id, refreshToken, req.headers['user-agent'])
    deps.addAuthEvent('oauth_login', { email: publicUser.email, provider: 'passport' })
    void remember
    return res.redirect(oauthSuccessRedirect())
  }

  function providerRoutes(provider, strategyName) {
    if (!isProviderConfigured(provider)) {
      app.get(`/api/auth/${provider}`, (_req, res) => {
        res.status(503).json({ ok: false, error: 'oauth_not_configured', provider })
      })
      app.get(`/api/auth/${provider}/callback`, (_req, res) => {
        res.redirect(oauthErrorRedirect('oauth_not_configured'))
      })
      return
    }

    app.get(`/api/auth/${provider}`, (req, res, next) => {
      if (req.query.remember === '1') req.session.oauthRemember = true
      passport.authenticate(strategyName, { scope: provider === 'google' ? ['profile', 'email'] : undefined })(
        req,
        res,
        next,
      )
    })

    app.get(`/api/auth/${provider}/callback`, (req, res, next) => {
      passport.authenticate(strategyName, (err, user, info) => {
        if (err) {
          console.error(`[auth] ${provider} callback error`, err)
          return res.redirect(oauthErrorRedirect('provider_api_failure'))
        }
        if (!user) {
          const code = req.query.error === 'access_denied' ? 'oauth_cancelled' : 'invalid_oauth_token'
          const msg = info?.message || String(req.query.error || '')
          return res.redirect(oauthErrorRedirect(code, msg))
        }
        const remember = req.session?.oauthRemember !== false
        delete req.session.oauthRemember
        return finishOAuth(req, res, user, remember)
      })(req, res, next)
    })
  }

  providerRoutes('google', 'google')
  providerRoutes('github', 'github')
  providerRoutes('linkedin', 'linkedin')

  /** Apple ID — placeholder until Sign in with Apple server keys are configured. */
  app.get('/api/auth/apple', (_req, res) => {
    res.status(501).json({
      ok: false,
      error: 'apple_oauth_placeholder',
      message: 'Sign in with Apple will be enabled in a future release.',
    })
  })
  app.get('/api/auth/apple/callback', (_req, res) => {
    res.redirect(oauthErrorRedirect('apple_oauth_placeholder'))
  })

  app.post('/api/auth/logout-all', (req, res) => {
    clearAuthCookies(res)
    return res.json({ ok: true })
  })
}
