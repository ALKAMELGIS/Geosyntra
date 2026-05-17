import { appConfig } from '../../../config/app'
import { normalizeEmail } from '../auth'
import { isAuthApiConfigured } from './authApi'
import type { PublicAuthUser } from './authApi'

export function isStaticLocalAuthMode(): boolean {
  return !isAuthApiConfigured()
}

export const LOCAL_VERIFICATION_TTL_MS = 60 * 60 * 1000

export function createVerificationToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function verificationExpiresAt(fromMs = Date.now()): string {
  return new Date(fromMs + LOCAL_VERIFICATION_TTL_MS).toISOString()
}

export function isVerificationExpired(expiresAt: unknown): boolean {
  if (!expiresAt) return false
  const t = Date.parse(String(expiresAt))
  if (!Number.isFinite(t)) return false
  return t <= Date.now()
}

/** Hash-router link for static hosting (no SMTP). Shown in check-email UI for demo/Pages. */
export function buildLocalVerificationLink(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = String(appConfig.basePath || '/').replace(/\/?$/, '/')
  const path = `${origin}${base === '/' ? '' : base}`
  return `${path}#/app/auth/verify-email?token=${encodeURIComponent(token)}`
}

export function adminRowToPublicUser(row: Record<string, unknown>): PublicAuthUser {
  return {
    id: typeof row.id === 'number' ? row.id : Number(row.id ?? Date.now()),
    name: String(row.name ?? row.email ?? ''),
    email: normalizeEmail(String(row.email ?? '')),
    role: String(row.role ?? 'Viewer'),
    emailVerified: row.emailVerified !== false,
  }
}

export function verifyEmailWithLocalToken(
  token: string,
  readUsers: () => Array<Record<string, unknown>>,
  writeUsers: (users: Array<Record<string, unknown>>) => void,
): { ok: true; user: PublicAuthUser } | { ok: false; error: string } {
  const trimmed = String(token || '').trim()
  if (!trimmed) return { ok: false, error: 'Missing verification token.' }
  const users = readUsers()
  const idx = users.findIndex(u => String(u.verificationToken ?? '') === trimmed)
  if (idx < 0) {
    return { ok: false, error: 'This verification link is invalid or expired.' }
  }
  const row = { ...users[idx]! }
  if (isVerificationExpired(row.verificationTokenExpires)) {
    return { ok: false, error: 'This verification link has expired. Request a new email.' }
  }
  row.emailVerified = true
  row.status = 'Active'
  delete row.verificationToken
  delete row.verificationTokenExpires
  users[idx] = row
  writeUsers(users)
  return { ok: true, user: adminRowToPublicUser(row) }
}

export function resendLocalVerification(
  email: string,
  readUsers: () => Array<Record<string, unknown>>,
  writeUsers: (users: Array<Record<string, unknown>>) => void,
): { ok: true; devVerificationLink: string } | { ok: false; error: string } {
  const key = normalizeEmail(email)
  const users = readUsers()
  const idx = users.findIndex(u => normalizeEmail(String(u.email ?? '')) === key)
  if (idx < 0) return { ok: false, error: 'No pending registration found for this email.' }
  const row = { ...users[idx]! }
  if (row.emailVerified === true) {
    return { ok: false, error: 'This email is already verified. You can sign in.' }
  }
  const token = createVerificationToken()
  row.verificationToken = token
  row.verificationTokenExpires = verificationExpiresAt()
  row.status = 'Pending Verification'
  users[idx] = row
  writeUsers(users)
  return { ok: true, devVerificationLink: buildLocalVerificationLink(token) }
}
