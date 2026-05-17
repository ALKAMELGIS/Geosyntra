export type PublicAuthUser = {
  id: number
  name: string
  email: string
  role: string
  emailVerified: boolean
}

function authApiBase(): string {
  return String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
}

export function isAuthApiConfigured(): boolean {
  return Boolean(authApiBase())
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const base = authApiBase()
  const url = `${base}${path}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    const data = (await res.json().catch(() => ({}))) as T
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'network_error' } as T }
  }
}

export async function apiRegister(input: {
  name: string
  email: string
  password: string
}): Promise<
  | { ok: true; needsVerification: true; email: string; devVerificationLink?: string }
  | { ok: false; error: string }
> {
  const { ok, status, data } = await authFetch<{
    ok?: boolean
    needsVerification?: boolean
    email?: string
    devVerificationLink?: string
    error?: string
    message?: string
    details?: string
  }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) })

  if (ok && data.ok && data.needsVerification) {
    return {
      ok: true,
      needsVerification: true,
      email: String(data.email || input.email),
      devVerificationLink: data.devVerificationLink,
    }
  }
  if (status === 409 || data.error === 'email_exists') {
    return { ok: false, error: 'An account with this email already exists. Sign in instead.' }
  }
  if (data.error === 'verification_email_failed') {
    return {
      ok: false,
      error: data.details || 'Could not send verification email. Try again later.',
    }
  }
  if (data.error === 'smtp_not_configured') {
    return { ok: false, error: data.message || 'Email verification is not configured on the server.' }
  }
  if (status === 0 || data.error === 'network_error') {
    return { ok: false, error: 'Cannot reach the auth server. Start the backend (port 3001) and try again.' }
  }
  return { ok: false, error: data.message || data.error || 'Registration failed.' }
}

export async function apiLogin(input: {
  email: string
  password: string
}): Promise<{ ok: true; user: PublicAuthUser } | { ok: false; error: string; needsVerification?: boolean }> {
  const { ok, status, data } = await authFetch<{
    ok?: boolean
    user?: PublicAuthUser
    error?: string
    message?: string
  }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) })

  if (ok && data.ok && data.user) {
    return { ok: true, user: data.user }
  }
  if (status === 403 || data.error === 'email_not_verified') {
    return {
      ok: false,
      needsVerification: true,
      error: data.message || 'Please verify your email before accessing GeoSyntra.',
    }
  }
  if (status === 401 || data.error === 'invalid_credentials') {
    return { ok: false, error: 'Incorrect email or password.' }
  }
  return { ok: false, error: data.message || data.error || 'Sign in failed.' }
}

export async function apiResendVerification(email: string): Promise<
  | { ok: true; devVerificationLink?: string }
  | { ok: false; error: string }
> {
  const { ok, data } = await authFetch<{
    ok?: boolean
    devVerificationLink?: string
    error?: string
    details?: string
    message?: string
  }>('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  if (ok && data.ok) {
    return { ok: true, devVerificationLink: data.devVerificationLink }
  }
  if (data.error === 'already_verified') {
    return { ok: false, error: 'This email is already verified. You can sign in.' }
  }
  return { ok: false, error: data.details || data.message || data.error || 'Could not resend email.' }
}

export async function apiVerifyEmail(token: string): Promise<
  { ok: true; user: PublicAuthUser } | { ok: false; error: string }
> {
  const { ok, data } = await authFetch<{ ok?: boolean; user?: PublicAuthUser; error?: string }>(
    `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
    { method: 'GET' },
  )
  if (ok && data.ok && data.user) {
    return { ok: true, user: data.user }
  }
  return { ok: false, error: data.error === 'invalid_token' ? 'This verification link is invalid or expired.' : 'Verification failed.' }
}

export async function apiOAuthUpsert(input: {
  email: string
  name: string
  provider: 'google' | 'apple'
  sub?: string
}): Promise<{ ok: true; user: PublicAuthUser } | { ok: false; error: string }> {
  const { ok, data } = await authFetch<{ ok?: boolean; user?: PublicAuthUser; error?: string }>(
    '/api/auth/oauth-upsert',
    { method: 'POST', body: JSON.stringify(input) },
  )
  if (ok && data.ok && data.user) {
    return { ok: true, user: data.user }
  }
  return { ok: false, error: data.error || 'OAuth sign-in failed.' }
}
