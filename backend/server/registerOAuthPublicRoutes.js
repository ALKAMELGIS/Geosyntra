/**
 * Public OAuth + email status for the SPA (no secrets).
 */
import { emailProviderLabel, hasEmailConfig } from './authEmail.js'
import {
  githubAuthLoginCreds,
  googleOAuthCreds,
  isProviderConfigured,
  linkedInOAuthCreds,
  resolveOAuthCallbackUrl,
} from './oauth/oauthConfig.js'

function normalizeBasePath(raw) {
  const s = String(raw || '/').trim()
  if (!s || s === '/') return '/'
  return s.endsWith('/') ? s : `${s}/`
}

function defaultOAuthRedirectUri() {
  const origin = String(process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '')
  if (!origin) return ''
  const base = normalizeBasePath(process.env.APP_BASE_PATH || '/')
  const prefix = base === '/' ? '' : base.replace(/\/$/, '')
  return `${origin}${prefix ? `${prefix}/` : '/'}oauth-return.html`
}

/** @param {import('express').Express} app */
export function registerOAuthPublicRoutes(app) {
  app.get('/api/auth/oauth/config', (_req, res) => {
    const redirectUri =
      String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim() ||
      String(process.env.LINKEDIN_OAUTH_REDIRECT_URI || '').trim() ||
      defaultOAuthRedirectUri()

    const google = googleOAuthCreds()
    const linkedin = linkedInOAuthCreds()
    const github = githubAuthLoginCreds()

    res.json({
      ok: true,
      redirectUri,
      /** Register in Google Cloud → Credentials → OAuth client → Authorized JavaScript origins */
      authorizedJavascriptOrigins: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://www.geosyntra.org',
        'https://geosyntra.org',
      ],
      // Popup + code-exchange flow (redirect_uri = static oauth-return.html). The
      // server-callback flow can't work here because the SPA host (GitHub Pages /
      // www.geosyntra.org) doesn't serve /api/auth/*/callback — the API is on a
      // separate origin. OAUTH_SERVER_REDIRECT=1 can force the Passport flow.
      serverRedirect: String(process.env.OAUTH_SERVER_REDIRECT || '').trim() === '1',
      providers: {
        google: isProviderConfigured('google'),
        linkedin: isProviderConfigured('linkedin'),
        github: isProviderConfigured('github'),
        apple: false,
      },
      callbacks: {
        google: resolveOAuthCallbackUrl('google'),
        linkedin: resolveOAuthCallbackUrl('linkedin'),
        github: resolveOAuthCallbackUrl('github'),
        apple: resolveOAuthCallbackUrl('apple'),
      },
      google: {
        configured: isProviderConfigured('google'),
        clientId: google.clientId,
      },
      linkedin: {
        configured: isProviderConfigured('linkedin'),
        clientId: linkedin.clientId,
      },
      apple: {
        configured: Boolean(String(process.env.APPLE_OAUTH_CLIENT_ID || '').trim()),
        clientId: String(process.env.APPLE_OAUTH_CLIENT_ID || '').trim(),
        placeholder: true,
      },
      github: {
        configured: isProviderConfigured('github'),
        clientId: github.clientId,
      },
    })
  })

  app.get('/api/auth/email/status', (_req, res) => {
    res.json({
      ok: true,
      configured: hasEmailConfig(),
      provider: emailProviderLabel(),
    })
  })
}
