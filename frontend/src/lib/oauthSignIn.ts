import { isWorkspaceApiConfigured, resolveApiUrl } from './apiClient'

/** Base path without trailing slash, e.g. `/Geosyntra` */
function normalizedBasePath(): string {
  const raw = typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/'
  return raw.replace(/\/+$/, '') || ''
}

/**
 * Google OAuth redirect URI (no `#` fragment — Google rejects fragments).
 * Static `public/oauth-return.html` forwards `?code&state` to `/#/app/auth/login?…`.
 */
/** Popup / code-exchange redirect (must match Google Console + LinkedIn app exactly). */
export function getGoogleOAuthRedirectUri(): string {
  const custom = String(import.meta.env.VITE_AUTH_GOOGLE_REDIRECT_URI ?? '').trim()
  if (custom) return custom
  if (typeof window === 'undefined') return ''
  const base = normalizedBasePath()
  const prefix = base ? `${base}/` : '/'
  return `${window.location.origin}${prefix}oauth-return.html`
}

export function resolveOAuthPopupRedirectUri(provider: 'google' | 'linkedin' | 'github' | 'apple'): string {
  const envKey =
    provider === 'google'
      ? 'VITE_AUTH_GOOGLE_REDIRECT_URI'
      : provider === 'linkedin'
        ? 'VITE_AUTH_LINKEDIN_REDIRECT_URI'
        : provider === 'github'
          ? 'VITE_AUTH_GITHUB_REDIRECT_URI'
          : 'VITE_AUTH_APPLE_REDIRECT_URI'
  const fromEnv = String(import.meta.env[envKey] ?? '').trim()
  if (fromEnv) return fromEnv
  if (isLocalDevHost()) return getGoogleOAuthRedirectUri()
  const fromApi = String(cachedOAuthPublicConfig?.redirectUri ?? '').trim()
  if (fromApi) return fromApi
  return getGoogleOAuthRedirectUri()
}

function getAppleOAuthRedirectUri(): string {
  const custom = String(import.meta.env.VITE_AUTH_APPLE_REDIRECT_URI ?? '').trim()
  if (custom) return custom
  return getGoogleOAuthRedirectUri()
}

const OAUTH_STATE_KEY = 'geosyntra_oauth_state'
const OAUTH_PROVIDER_KEY = 'geosyntra_oauth_provider'

export type OAuthHandshakeProvider = 'google' | 'apple' | 'github' | 'linkedin'

export type OAuthPublicConfig = {
  ok: boolean
  redirectUri?: string
  authorizedJavascriptOrigins?: string[]
  serverRedirect?: boolean
  providers?: {
    google?: boolean
    linkedin?: boolean
    github?: boolean
    apple?: boolean
  }
  callbacks?: Record<string, string>
  google?: { configured?: boolean; clientId?: string }
  linkedin?: { configured?: boolean; clientId?: string }
  apple?: { configured?: boolean; clientId?: string; placeholder?: boolean }
  github?: { configured?: boolean; clientId?: string }
}

let cachedOAuthPublicConfig: OAuthPublicConfig | null = null
let oauthConfigPromise: Promise<OAuthPublicConfig | null> | null = null

/** Clear cached OAuth public config (e.g. before retrying API load). */
export function invalidateOAuthPublicConfig(): void {
  cachedOAuthPublicConfig = null
  oauthConfigPromise = null
}

function rememberOAuthHandshake(provider: OAuthHandshakeProvider, state: string) {
  try {
    sessionStorage.setItem(OAUTH_STATE_KEY, state)
    sessionStorage.setItem(OAUTH_PROVIDER_KEY, provider)
  } catch {
    /* ignore */
  }
}

export function readStoredOAuthState(): string {
  try {
    return sessionStorage.getItem(OAUTH_STATE_KEY) || ''
  } catch {
    return ''
  }
}

export function readStoredOAuthProvider(): OAuthHandshakeProvider | '' {
  try {
    const v = sessionStorage.getItem(OAUTH_PROVIDER_KEY) || ''
    return v === 'google' || v === 'apple' || v === 'github' || v === 'linkedin' ? v : ''
  } catch {
    return ''
  }
}

export function isOAuthStateValid(received: string | null): boolean {
  const expected = readStoredOAuthState()
  if (!expected) return true
  if (!received?.trim()) return false
  return received.trim() === expected
}

export function clearOAuthHandshake() {
  try {
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_PROVIDER_KEY)
  } catch {
    /* ignore */
  }
}

/** Load OAuth client IDs from the API (no secrets). Cached for the session. */
export async function loadOAuthPublicConfig(): Promise<OAuthPublicConfig | null> {
  if (cachedOAuthPublicConfig) return cachedOAuthPublicConfig
  if (oauthConfigPromise) return oauthConfigPromise
  oauthConfigPromise = fetch(resolveApiUrl('/api/auth/oauth/config'), { credentials: 'include' })
    .then(async res => {
      if (!res.ok) return null
      const data = (await res.json().catch(() => ({}))) as OAuthPublicConfig
      if (data?.ok !== true) return null
      cachedOAuthPublicConfig = data
      return data
    })
    .catch(() => null)
    .finally(() => {
      oauthConfigPromise = null
    })
  return oauthConfigPromise
}

function googleClientIdFromApi(): string {
  return String(cachedOAuthPublicConfig?.google?.clientId ?? '').trim()
}

function appleClientIdFromApi(): string {
  return String(cachedOAuthPublicConfig?.apple?.clientId ?? '').trim()
}

function githubClientIdFromApi(): string {
  return String(cachedOAuthPublicConfig?.github?.clientId ?? '').trim()
}

/** Whether Google SSO is wired in env (full authorize URL or OAuth web client id). */
export function isGoogleOAuthConfigured(): boolean {
  if (String(import.meta.env.VITE_AUTH_GOOGLE_URL ?? '').trim()) return true
  if (String(import.meta.env.VITE_AUTH_GOOGLE_CLIENT_ID ?? '').trim()) return true
  return Boolean(cachedOAuthPublicConfig?.google?.configured && googleClientIdFromApi())
}

/** Whether Apple SSO is wired in env (full authorize URL or Services ID). */
export function isAppleOAuthConfigured(): boolean {
  if (String(import.meta.env.VITE_AUTH_APPLE_URL ?? '').trim()) return true
  if (String(import.meta.env.VITE_AUTH_APPLE_CLIENT_ID ?? '').trim()) return true
  return Boolean(cachedOAuthPublicConfig?.apple?.configured && appleClientIdFromApi())
}

function linkedInClientIdFromApi(): string {
  return String(cachedOAuthPublicConfig?.linkedin?.clientId ?? '').trim()
}

/** Whether GitHub SSO is wired in env (full authorize URL or OAuth App client id). */
export function isGitHubOAuthConfigured(): boolean {
  if (String(import.meta.env.VITE_AUTH_GITHUB_URL ?? '').trim()) return true
  if (String(import.meta.env.VITE_AUTH_GITHUB_CLIENT_ID ?? '').trim()) return true
  return Boolean(cachedOAuthPublicConfig?.github?.configured && githubClientIdFromApi())
}

/** Whether LinkedIn SSO is configured on the API. */
export function isLinkedInOAuthConfigured(): boolean {
  if (String(import.meta.env.VITE_AUTH_LINKEDIN_URL ?? '').trim()) return true
  if (String(import.meta.env.VITE_AUTH_LINKEDIN_CLIENT_ID ?? '').trim()) return true
  return Boolean(cachedOAuthPublicConfig?.linkedin?.configured && linkedInClientIdFromApi())
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

/** Backend-only OAuth redirect (Passport) — production. Local dev uses popup + code exchange. */
export function useServerOAuthRedirect(): boolean {
  if (!isWorkspaceApiConfigured()) return false
  if (isLocalDevHost()) return false
  // Only use the Passport server-callback flow when the API explicitly opts in.
  // Otherwise use the popup + code-exchange flow, whose redirect_uri is the static
  // oauth-return.html served by the SPA host (works for GitHub Pages + separate API).
  return cachedOAuthPublicConfig?.serverRedirect === true
}

export function startServerOAuthRedirect(
  provider: Extract<OAuthHandshakeProvider, 'google' | 'linkedin' | 'github'>,
  remember = true,
): void {
  const q = remember ? '?remember=1' : ''
  window.location.assign(resolveApiUrl(`/api/auth/${provider}${q}`))
}

/** Providers with env configured (used to show OAuth buttons on the welcome wizard). */
export function listConfiguredOAuthProviders(): OAuthHandshakeProvider[] {
  const providers: OAuthHandshakeProvider[] = []
  if (isGoogleOAuthConfigured()) providers.push('google')
  if (isLinkedInOAuthConfigured()) providers.push('linkedin')
  if (isGitHubOAuthConfigured()) providers.push('github')
  if (isAppleOAuthConfigured()) providers.push('apple')
  return providers
}

/** Full IdP authorize URL, or built from `VITE_AUTH_GOOGLE_CLIENT_ID`. */
export function resolveGoogleAuthorizationUrl(): string | null {
  const full = String(import.meta.env.VITE_AUTH_GOOGLE_URL ?? '').trim()
  if (full) return full

  const clientId =
    String(import.meta.env.VITE_AUTH_GOOGLE_CLIENT_ID ?? '').trim() || googleClientIdFromApi()
  if (!clientId) return null

  const redirect = resolveOAuthPopupRedirectUri('google')
  if (!redirect) return null

  const state =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  rememberOAuthHandshake('google', state)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** Full Apple authorize URL, or built from `VITE_AUTH_APPLE_CLIENT_ID`. */
export function resolveAppleAuthorizationUrl(): string | null {
  const full = String(import.meta.env.VITE_AUTH_APPLE_URL ?? '').trim()
  if (full) return full

  const clientId =
    String(import.meta.env.VITE_AUTH_APPLE_CLIENT_ID ?? '').trim() || appleClientIdFromApi()
  if (!clientId) return null

  const redirect = resolveOAuthPopupRedirectUri('apple')
  if (!redirect) return null

  const state =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  rememberOAuthHandshake('apple', state)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'name email',
    response_mode: 'query',
    state,
  })

  return `https://appleid.apple.com/auth/authorize?${params.toString()}`
}

function getGitHubOAuthRedirectUri(): string {
  const custom = String(import.meta.env.VITE_AUTH_GITHUB_REDIRECT_URI ?? '').trim()
  if (custom) return custom
  return getGoogleOAuthRedirectUri()
}

/** Full GitHub authorize URL, or built from `VITE_AUTH_GITHUB_CLIENT_ID`. */
export function resolveGitHubAuthorizationUrl(): string | null {
  const full = String(import.meta.env.VITE_AUTH_GITHUB_URL ?? '').trim()
  if (full) return full

  const clientId =
    String(import.meta.env.VITE_AUTH_GITHUB_CLIENT_ID ?? '').trim() || githubClientIdFromApi()
  if (!clientId) return null

  const redirect = resolveOAuthPopupRedirectUri('github')
  if (!redirect) return null

  const state =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  rememberOAuthHandshake('github', state)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'read:user user:email',
    state,
    allow_signup: 'true',
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

/** Full LinkedIn authorize URL (OpenID scopes). */
export function resolveLinkedInAuthorizationUrl(): string | null {
  const full = String(import.meta.env.VITE_AUTH_LINKEDIN_URL ?? '').trim()
  if (full) return full

  const clientId =
    String(import.meta.env.VITE_AUTH_LINKEDIN_CLIENT_ID ?? '').trim() || linkedInClientIdFromApi()
  if (!clientId) return null

  const redirect = resolveOAuthPopupRedirectUri('linkedin')
  if (!redirect) return null

  const state =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  rememberOAuthHandshake('linkedin', state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'openid profile email',
    state,
  })

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}

export async function exchangeGoogleAuthCode(code: string, redirectUri: string): Promise<{
  ok: boolean
  email?: string
  name?: string
  sub?: string
  error?: string
}> {
  const url = resolveApiUrl('/api/auth/google/exchange')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { ok: false, error: String(data.error || data.detail || `HTTP ${res.status}`) }
  }
  if (data.ok !== true) return { ok: false, error: String(data.error || 'exchange_failed') }
  return {
    ok: true,
    email: typeof data.email === 'string' ? data.email : undefined,
    name: typeof data.name === 'string' ? data.name : undefined,
    sub: typeof data.sub === 'string' ? data.sub : undefined,
  }
}

export async function exchangeAppleAuthCode(code: string, redirectUri: string): Promise<{
  ok: boolean
  email?: string
  name?: string
  sub?: string
  error?: string
  message?: string
}> {
  const url = resolveApiUrl('/api/auth/apple/exchange')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return {
      ok: false,
      error: String(data.error || data.detail || `HTTP ${res.status}`),
      message: typeof data.message === 'string' ? data.message : undefined,
    }
  }
  if (data.ok !== true) return { ok: false, error: String(data.error || 'exchange_failed') }
  const email = typeof data.email === 'string' ? data.email : ''
  if (!email) {
    return {
      ok: false,
      error: String(data.error || 'apple_email_missing'),
      message: typeof data.message === 'string' ? data.message : undefined,
    }
  }
  return {
    ok: true,
    email,
    name: email.split('@')[0] || 'Apple User',
    sub: typeof data.sub === 'string' ? data.sub : undefined,
  }
}

export async function exchangeGitHubAuthCode(code: string, redirectUri: string): Promise<{
  ok: boolean
  email?: string
  name?: string
  sub?: string
  error?: string
  message?: string
}> {
  const url = resolveApiUrl('/api/auth/github/exchange')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return {
      ok: false,
      error: String(data.error || data.detail || `HTTP ${res.status}`),
      message: typeof data.message === 'string' ? data.message : undefined,
    }
  }
  if (data.ok !== true) return { ok: false, error: String(data.error || 'exchange_failed') }
  return {
    ok: true,
    email: typeof data.email === 'string' ? data.email : undefined,
    name: typeof data.name === 'string' ? data.name : undefined,
    sub: typeof data.sub === 'string' ? data.sub : undefined,
  }
}

export async function exchangeLinkedInAuthCode(code: string, redirectUri: string): Promise<{
  ok: boolean
  email?: string
  name?: string
  sub?: string
  error?: string
  message?: string
}> {
  const url = resolveApiUrl('/api/auth/linkedin/exchange')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return {
      ok: false,
      error: String(data.error || data.detail || `HTTP ${res.status}`),
      message: typeof data.message === 'string' ? data.message : undefined,
    }
  }
  if (data.ok !== true) return { ok: false, error: String(data.error || 'exchange_failed') }
  return {
    ok: true,
    email: typeof data.email === 'string' ? data.email : undefined,
    name: typeof data.name === 'string' ? data.name : undefined,
    sub: typeof data.sub === 'string' ? data.sub : undefined,
  }
}

export { getAppleOAuthRedirectUri, getGitHubOAuthRedirectUri }
