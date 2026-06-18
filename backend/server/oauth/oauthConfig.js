/**
 * OAuth environment resolution (secrets stay server-side only).
 */
const PROVIDERS = ['google', 'linkedin', 'github', 'apple']

function trim(v) {
  return String(v || '').trim()
}

function appOrigin() {
  return trim(process.env.APP_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '')
}

function appBasePath() {
  const s = trim(process.env.APP_BASE_PATH || '/')
  if (!s || s === '/') return ''
  return s.replace(/\/$/, '')
}

/** Vite/GitHub Pages entry + hash route, e.g. `http://localhost:5173/Geosyntra/#/app/auth/oauth-callback`. */
export function buildSpaHashUrl(hashRoute, query = '') {
  const origin = appOrigin()
  const base = appBasePath()
  const prefix = base ? `${base}/` : '/'
  const route = hashRoute.startsWith('/') ? hashRoute : `/${hashRoute}`
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : ''
  return `${origin}${prefix}#${route}${q}`
}

export function frontendAuthCallbackPath() {
  return buildSpaHashUrl('/app/auth/oauth-callback')
}

export function oauthSuccessRedirect() {
  return buildSpaHashUrl('/app/auth/oauth-callback', 'ok=1')
}

export function oauthErrorRedirect(code, message) {
  const params = new URLSearchParams({ ok: '0', error: code })
  if (message) params.set('message', message.slice(0, 200))
  return buildSpaHashUrl('/app/auth/oauth-callback', params.toString())
}

export function oauthDashboardRedirect() {
  const dash = trim(process.env.OAUTH_SUCCESS_REDIRECT || '/satellite/indices')
  const path = dash.startsWith('/') ? dash : `/${dash}`
  return buildSpaHashUrl(path)
}

export function resolveOAuthCallbackUrl(provider) {
  const key = String(provider || '').toUpperCase()
  const explicit =
    trim(process.env[`${key}_OAUTH_CALLBACK_URL`]) ||
    trim(process.env[`${key}_CALLBACK_URL`]) ||
    trim(process.env[`AUTH_${key}_CALLBACK_URL`])
  if (explicit) return explicit
  const origin = trim(process.env.OAUTH_CALLBACK_ORIGIN || appOrigin()).replace(/\/+$/, '')
  return `${origin}/api/auth/${provider}/callback`
}

export function googleOAuthCreds() {
  return {
    clientId: trim(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID),
    clientSecret: trim(process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    callbackURL: resolveOAuthCallbackUrl('google'),
  }
}

export function linkedInOAuthCreds() {
  return {
    clientId: trim(process.env.LINKEDIN_CLIENT_ID || process.env.LINKEDIN_OAUTH_CLIENT_ID),
    clientSecret: trim(process.env.LINKEDIN_CLIENT_SECRET || process.env.LINKEDIN_OAUTH_CLIENT_SECRET),
    callbackURL: resolveOAuthCallbackUrl('linkedin'),
  }
}

export function githubAuthLoginCreds() {
  return {
    clientId: trim(
      process.env.GITHUB_CLIENT_ID ||
        process.env.AUTH_GITHUB_CLIENT_ID ||
        process.env.GITHUB_OAUTH_CLIENT_ID,
    ),
    clientSecret: trim(
      process.env.GITHUB_CLIENT_SECRET ||
        process.env.AUTH_GITHUB_CLIENT_SECRET ||
        process.env.GITHUB_OAUTH_CLIENT_SECRET,
    ),
    callbackURL: resolveOAuthCallbackUrl('github'),
  }
}

export function isProviderConfigured(provider) {
  if (provider === 'apple') {
    return Boolean(trim(process.env.APPLE_OAUTH_CLIENT_ID))
  }
  if (provider === 'google') {
    const c = googleOAuthCreds()
    return Boolean(c.clientId && c.clientSecret)
  }
  if (provider === 'linkedin') {
    const c = linkedInOAuthCreds()
    return Boolean(c.clientId && c.clientSecret)
  }
  if (provider === 'github') {
    const c = githubAuthLoginCreds()
    return Boolean(c.clientId && c.clientSecret)
  }
  return false
}

export function listConfiguredOAuthProviders() {
  return PROVIDERS.filter(p => p !== 'apple' && isProviderConfigured(p))
}

export function sessionSecret() {
  return trim(process.env.SESSION_SECRET || process.env.JWT_SECRET || 'geosyntra-dev-session')
}
