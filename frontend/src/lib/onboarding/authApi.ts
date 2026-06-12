import { readAccessToken } from '../auth'
import { isWorkspaceApiConfigured, resolveApiUrl } from '../apiClient'

export type PublicAuthUser = {
  id: number
  name: string
  email: string
  username?: string
  profileImage?: string
  oauthProvider?: string
  oauthProviders?: string[]
  role: string
  roleSlug?: string
  status?: string
  emailVerified: boolean
  permissions?: string[]
  createdAt?: string
  lastLogin?: string
}

function authApiBase(): string {
  return String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
}

/** True when the SPA can reach workspace auth (explicit API URL or same-origin backend). */
export function isAuthApiConfigured(): boolean {
  return isWorkspaceApiConfigured()
}

function ownerProvisionAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const jwt = readAccessToken()
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`
    return headers
  }
  const raw = import.meta.env.VITE_AGRI_ADMIN_DIRECTORY_TOKEN
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (t) {
    headers['X-Agri-Admin-Directory-Token'] = t
    headers.Authorization = `Bearer ${t}`
  }
  return headers
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const url = resolveApiUrl(path)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  const jwt = readAccessToken()
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  try {
    const res = await fetch(url, {
      ...init,
      credentials: 'include',
      headers,
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
  planId?: string
}): Promise<
  | { ok: true; needsVerification: true; email: string; devVerificationLink?: string }
  | { ok: false; error: string; needsVerification?: boolean; email?: string }
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
  if (data.error === 'role_not_self_assignable') {
    return {
      ok: false,
      error:
        data.message ||
        'Owner and Admin roles cannot be selected during sign up. Choose another role or contact your administrator.',
    }
  }
  if (data.error === 'email_exists_unverified') {
    return {
      ok: false,
      needsVerification: true,
      error:
        data.message ||
        'This email is awaiting verification. Check your inbox or resend the activation email.',
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
  if (data.error === 'email_not_configured' || data.error === 'smtp_not_configured') {
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
}): Promise<
  | { ok: true; user: PublicAuthUser; accessToken?: string }
  | { ok: false; error: string; needsVerification?: boolean; pendingApproval?: boolean }
> {
  const { ok, status, data } = await authFetch<{
    ok?: boolean
    user?: PublicAuthUser
    accessToken?: string
    error?: string
    message?: string
  }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) })

  if (ok && data.ok && data.user) {
    return { ok: true, user: data.user, accessToken: data.accessToken }
  }
  if (status === 403 && data.error === 'pending_approval') {
    return {
      ok: false,
      pendingApproval: true,
      error: data.message || 'Your account is awaiting administrator approval.',
    }
  }
  if (status === 403 || data.error === 'email_not_verified') {
    return {
      ok: false,
      needsVerification: true,
      error: data.message || 'Please verify your email before accessing GeoSyntra.',
    }
  }
  if (status === 401 && data.error === 'user_not_found') {
    return {
      ok: false,
      error:
        data.message ||
        'No sign-in account on the server for this email. Ask your administrator to enable cross-device sign-in or reset your password.',
    }
  }
  if (status === 401 && data.error === 'invalid_password') {
    return { ok: false, error: data.message || 'Incorrect password.' }
  }
  if (status === 403 && data.error === 'auth_incomplete') {
    return {
      ok: false,
      error:
        data.message ||
        'Account exists but is not activated for sign-in. Contact your administrator.',
    }
  }
  if (status === 401 || data.error === 'invalid_credentials') {
    return { ok: false, error: data.message || 'Incorrect email or password.' }
  }
  if (status === 0 || data.error === 'network_error') {
    return { ok: false, error: 'Cannot reach the auth server. Start the backend (port 3001) and try again.' }
  }
  return { ok: false, error: data.message || data.error || 'Sign in failed.' }
}

export type ApiProvisionUserInput = {
  name: string
  email: string
  password: string
  role: string
  status: string
  emailVerified: boolean
  profileExtra?: Record<string, unknown>
  provisionedBy?: string
  /** When true, updates password/sign-in flags if the email already exists on the auth server. */
  ensureSignIn?: boolean
}

export async function apiRepairUserSignIn(
  input: ApiProvisionUserInput,
): Promise<{ ok: true; user: PublicAuthUser; repaired?: boolean } | { ok: false; error: string }> {
  if (!isAuthApiConfigured()) {
    return {
      ok: false,
      error:
        'Cross-device sign-in requires a backend API. Set VITE_API_BASE_URL or deploy with the auth server on the same host.',
    }
  }
  const base = authApiBase()
  const url = base ? `${base}/api/auth/admin/provision-user` : '/api/auth/admin/provision-user'
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: ownerProvisionAuthHeaders(),
      body: JSON.stringify({ ...input, ensureSignIn: true }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      user?: PublicAuthUser
      repaired?: boolean
      error?: string
      message?: string
    }
    if (res.ok && data.ok && data.user) {
      return { ok: true, user: data.user, repaired: data.repaired }
    }
    return { ok: false, error: data.message || data.error || 'Could not sync sign-in on the server.' }
  } catch {
    return { ok: false, error: 'Cannot reach the auth server.' }
  }
}

export async function apiProvisionUser(
  input: ApiProvisionUserInput,
): Promise<{ ok: true; user: PublicAuthUser; repaired?: boolean } | { ok: false; error: string }> {
  if (!isAuthApiConfigured()) {
    return {
      ok: false,
      error:
        'Auth API is not available on this host. Set VITE_API_BASE_URL or deploy with the backend on the same origin.',
    }
  }
  const base = authApiBase()
  const url = base ? `${base}/api/auth/admin/provision-user` : '/api/auth/admin/provision-user'
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: ownerProvisionAuthHeaders(),
      body: JSON.stringify({ ...input, ensureSignIn: input.ensureSignIn ?? true }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      user?: PublicAuthUser
      repaired?: boolean
      error?: string
      message?: string
    }
    if (res.ok && data.ok && data.user) {
      return { ok: true, user: data.user, repaired: data.repaired }
    }
    if (data.error === 'email_exists') {
      return { ok: false, error: data.message || 'An account with this email already exists on the auth server.' }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error:
          data.message ||
          'Not authorized to provision accounts. Sign in as Owner or configure VITE_AGRI_ADMIN_DIRECTORY_TOKEN.',
      }
    }
    if (res.status === 0) {
      return { ok: false, error: 'Cannot reach the auth server. Check VITE_API_BASE_URL and backend availability.' }
    }
    return { ok: false, error: data.message || data.error || 'Failed to create sign-in account on server.' }
  } catch {
    return { ok: false, error: 'Cannot reach the auth server.' }
  }
}

export async function apiResendVerification(email: string): Promise<
  | { ok: true; devVerificationLink?: string }
  | { ok: false; error: string; retryAfterSec?: number }
> {
  const { ok, status, data } = await authFetch<{
    ok?: boolean
    devVerificationLink?: string
    error?: string
    details?: string
    message?: string
    retryAfterSec?: number
  }>('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  if (ok && data.ok) {
    return { ok: true, devVerificationLink: data.devVerificationLink }
  }
  if (status === 429 || data.error === 'resend_cooldown') {
    const sec = Number(data.retryAfterSec) || 60
    return {
      ok: false,
      error: data.message || `Please wait ${sec}s before resending.`,
      retryAfterSec: sec,
    }
  }
  if (data.error === 'already_verified') {
    return { ok: false, error: 'This email is already verified. You can sign in.' }
  }
  return { ok: false, error: data.details || data.message || data.error || 'Could not resend email.' }
}

export async function apiVerifyEmail(token: string): Promise<
  | { ok: true; user: PublicAuthUser; accessToken?: string; pendingApproval?: boolean }
  | { ok: false; error: string; expired?: boolean }
> {
  const { ok, data } = await authFetch<{
    ok?: boolean
    user?: PublicAuthUser
    accessToken?: string
    pendingApproval?: boolean
    error?: string
    message?: string
  }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { method: 'GET' })
  if (ok && data.ok && data.user) {
    return {
      ok: true,
      user: data.user,
      accessToken: data.accessToken,
      pendingApproval: data.pendingApproval,
    }
  }
  if (data.error === 'token_expired') {
    return {
      ok: false,
      expired: true,
      error: data.message || 'This verification link has expired. Request a new email.',
    }
  }
  return {
    ok: false,
    error:
      data.error === 'invalid_token'
        ? data.message || 'This verification link is invalid or expired.'
        : data.message || 'Verification failed.',
  }
}

export async function apiForgotUsername(email: string): Promise<
  | {
      ok: true
      found: boolean
      signInId?: string
      username?: string
      oauthOnly?: boolean
      message: string
    }
  | { ok: false; error: string }
> {
  const { ok, status, data } = await authFetch<{
    ok?: boolean
    found?: boolean
    signInId?: string
    username?: string
    oauthOnly?: boolean
    message?: string
    error?: string
  }>('/api/auth/forgot-username', { method: 'POST', body: JSON.stringify({ email }) })
  if (ok && data.ok) {
    return {
      ok: true,
      found: Boolean(data.found),
      signInId: data.signInId,
      username: data.username,
      oauthOnly: data.oauthOnly,
      message: data.message || 'Lookup complete.',
    }
  }
  if (status === 0) {
    return { ok: false, error: 'Cannot reach the auth server. Start the backend (port 3001) and try again.' }
  }
  return { ok: false, error: data.message || data.error || 'Could not look up username.' }
}

export async function apiForgotPassword(email: string): Promise<
  | { ok: true; message: string; devResetLink?: string }
  | { ok: false; error: string; retryAfterSec?: number }
> {
  const { ok, status, data } = await authFetch<{
    ok?: boolean
    message?: string
    devResetLink?: string
    error?: string
    details?: string
    retryAfterSec?: number
  }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
  if (ok && data.ok) {
    return {
      ok: true,
      message: data.message || 'If an account exists, check your inbox for reset instructions.',
      devResetLink: data.devResetLink,
    }
  }
  if (status === 429 || data.error === 'reset_cooldown') {
    const sec = Number(data.retryAfterSec) || 60
    return {
      ok: false,
      error: data.message || `Please wait ${sec}s before requesting another reset email.`,
      retryAfterSec: sec,
    }
  }
  if (data.error === 'oauth_only') {
    return { ok: false, error: data.message || 'This account uses social sign-in only.' }
  }
  if (data.error === 'email_not_configured') {
    return { ok: false, error: data.message || 'Password reset email is not configured on the server.' }
  }
  if (status === 0) {
    return { ok: false, error: 'Cannot reach the auth server. Start the backend (port 3001) and try again.' }
  }
  return { ok: false, error: data.details || data.message || data.error || 'Could not send reset email.' }
}

export async function apiResetPassword(
  token: string,
  password: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string; expired?: boolean }> {
  const { ok, data } = await authFetch<{
    ok?: boolean
    message?: string
    error?: string
  }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
  if (ok && data.ok) {
    return { ok: true, message: data.message || 'Password updated. You can sign in now.' }
  }
  if (data.error === 'token_expired') {
    return {
      ok: false,
      expired: true,
      error: data.message || 'This reset link has expired. Request a new password reset email.',
    }
  }
  return {
    ok: false,
    error:
      data.error === 'invalid_token'
        ? data.message || 'This reset link is invalid or expired.'
        : data.message || 'Could not reset password.',
  }
}

export async function apiOAuthUpsert(input: {
  email: string
  name: string
  provider: 'google' | 'apple' | 'github'
  sub?: string
}): Promise<
  | { ok: true; user: PublicAuthUser; accessToken?: string }
  | { ok: false; error: string }
> {
  const { ok, data } = await authFetch<{
    ok?: boolean
    user?: PublicAuthUser
    accessToken?: string
    error?: string
  }>('/api/auth/oauth-upsert', { method: 'POST', body: JSON.stringify(input) })
  if (ok && data.ok && data.user) {
    return { ok: true, user: data.user, accessToken: data.accessToken }
  }
  return { ok: false, error: data.error || 'OAuth sign-in failed.' }
}
