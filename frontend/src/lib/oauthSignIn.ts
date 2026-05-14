/** Base path without trailing slash, e.g. `/Geosyntra` */
function normalizedBasePath(): string {
  const raw = typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/'
  return raw.replace(/\/+$/, '') || ''
}

/**
 * Google OAuth redirect URI (no `#` fragment — Google rejects fragments).
 * Static `public/oauth-return.html` forwards `?code&state` to `/#/login?…`.
 */
export function getGoogleOAuthRedirectUri(): string {
  const custom = String(import.meta.env.VITE_AUTH_GOOGLE_REDIRECT_URI ?? '').trim()
  if (custom) return custom
  if (typeof window === 'undefined') return ''
  const base = normalizedBasePath()
  const prefix = base ? `${base}/` : '/'
  return `${window.location.origin}${prefix}oauth-return.html`
}

function getAppleOAuthRedirectUri(): string {
  const custom = String(import.meta.env.VITE_AUTH_APPLE_REDIRECT_URI ?? '').trim()
  if (custom) return custom
  return getGoogleOAuthRedirectUri()
}

const OAUTH_STATE_KEY = 'geosyntra_oauth_state'
const OAUTH_PROVIDER_KEY = 'geosyntra_oauth_provider'

function rememberOAuthHandshake(provider: 'google' | 'apple', state: string) {
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

export function readStoredOAuthProvider(): 'google' | 'apple' | '' {
  try {
    const v = sessionStorage.getItem(OAUTH_PROVIDER_KEY) || ''
    return v === 'google' || v === 'apple' ? v : ''
  } catch {
    return ''
  }
}

export function clearOAuthHandshake() {
  try {
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_PROVIDER_KEY)
  } catch {
    /* ignore */
  }
}

/** Full IdP authorize URL, or built from `VITE_AUTH_GOOGLE_CLIENT_ID`. */
export function resolveGoogleAuthorizationUrl(): string | null {
  const full = String(import.meta.env.VITE_AUTH_GOOGLE_URL ?? '').trim()
  if (full) return full

  const clientId = String(import.meta.env.VITE_AUTH_GOOGLE_CLIENT_ID ?? '').trim()
  if (!clientId) return null

  const redirect = getGoogleOAuthRedirectUri()
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

  const clientId = String(import.meta.env.VITE_AUTH_APPLE_CLIENT_ID ?? '').trim()
  if (!clientId) return null

  const redirect = getAppleOAuthRedirectUri()
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

function apiOrigin(): string {
  const raw = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  return raw || ''
}

export async function exchangeGoogleAuthCode(code: string, redirectUri: string): Promise<{
  ok: boolean
  email?: string
  name?: string
  error?: string
}> {
  const url = `${apiOrigin()}/api/auth/google/exchange`
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
  }
}
