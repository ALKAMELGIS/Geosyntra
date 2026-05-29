/**
 * Public OAuth configuration for the SPA (client IDs only — never secrets).
 */

function normalizeBasePath(raw) {
  const s = String(raw || '/').trim()
  if (!s || s === '/') return '/'
  return s.endsWith('/') ? s : `${s}/`
}

export function resolveDefaultOAuthRedirectUri(appOrigin, appBasePath) {
  const origin = String(appOrigin || '').trim().replace(/\/+$/, '')
  const base = normalizeBasePath(appBasePath)
  const prefix = base === '/' ? '/' : base
  return `${origin}${prefix}oauth-return.html`
}

export function getOAuthPublicConfig(appOrigin, appBasePath) {
  const redirectUri =
    String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim() ||
    String(process.env.APPLE_OAUTH_REDIRECT_URI || '').trim() ||
    resolveDefaultOAuthRedirectUri(appOrigin, appBasePath)

  const googleClientId = String(
    process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  ).trim()
  const googleSecret = String(
    process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  ).trim()

  const appleClientId = String(process.env.APPLE_OAUTH_CLIENT_ID || '').trim()
  const appleTeam = String(process.env.APPLE_OAUTH_TEAM_ID || '').trim()
  const appleKey = String(process.env.APPLE_OAUTH_KEY_ID || '').trim()
  const applePrivateKey = String(process.env.APPLE_OAUTH_PRIVATE_KEY || '').trim()

  const githubClientId = String(
    process.env.AUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
  ).trim()
  const githubSecret = String(
    process.env.AUTH_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
  ).trim()

  return {
    ok: true,
    redirectUri,
    google: {
      configured: Boolean(googleClientId && googleSecret),
      clientId: googleClientId || undefined,
    },
    apple: {
      configured: Boolean(appleClientId && appleTeam && appleKey && applePrivateKey),
      clientId: appleClientId || undefined,
    },
    github: {
      configured: Boolean(githubClientId && githubSecret),
      clientId: githubClientId || undefined,
    },
  }
}
