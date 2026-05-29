import { appConfig } from '../../../config/app'
import { normalizeEmail } from '../auth'
import { sha256Hex } from '../sha256Hex'
import {
  createVerificationToken,
  isVerificationExpired,
  verificationExpiresAt,
} from './localAuthVerification'

export function buildLocalPasswordResetLink(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = String(appConfig.basePath || '/').replace(/\/?$/, '/')
  const path = `${origin}${base === '/' ? '' : base}`
  return `${path}#/app/auth/reset-password?token=${encodeURIComponent(token)}`
}

function readProfileExtra(row: Record<string, unknown>): Record<string, unknown> {
  const raw = row.profileExtra
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
}

export function lookupLocalUsernameHint(
  email: string,
  readUsers: () => Array<Record<string, unknown>>,
):
  | {
      ok: true
      found: true
      signInId: string
      username: string
      oauthOnly?: boolean
      message: string
    }
  | { ok: true; found: false; message: string } {
  const key = normalizeEmail(email)
  const row = readUsers().find(u => normalizeEmail(String(u.email ?? '')) === key)
  if (!row) {
    return {
      ok: true,
      found: false,
      message:
        'No GeoSyntra account was found for this email. Check the spelling or sign up for a new workspace.',
    }
  }
  const extra = readProfileExtra(row)
  const signInId = key
  const username = String(row.username ?? extra.username ?? signInId).trim() || signInId
  const hasPassword = Boolean(String(row.passwordHash ?? '').trim())
  const oauthProviders = Array.isArray(extra.oauthProviders)
    ? (extra.oauthProviders as string[])
    : []
  if (!hasPassword && oauthProviders.length > 0) {
    return {
      ok: true,
      found: true,
      signInId,
      username,
      oauthOnly: true,
      message: `This account uses ${oauthProviders.join(', ')} only. Sign in with the same provider you used when registering.`,
    }
  }
  return {
    ok: true,
    found: true,
    signInId,
    username,
    message: `Sign in with email ${signInId}${username !== signInId ? ` (display name: ${username})` : ''}.`,
  }
}

export async function requestLocalPasswordReset(
  email: string,
  readUsers: () => Array<Record<string, unknown>>,
  writeUsers: (users: Array<Record<string, unknown>>) => void,
): Promise<
  | { ok: true; devResetLink: string; message: string }
  | { ok: false; error: string }
> {
  const key = normalizeEmail(email)
  const users = readUsers()
  const idx = users.findIndex(u => normalizeEmail(String(u.email ?? '')) === key)
  if (idx < 0) {
    return {
      ok: true,
      devResetLink: '',
      message: 'If an account exists for this email, password reset instructions were sent.',
    }
  }
  const row = { ...users[idx]! }
  if (!String(row.passwordHash ?? '').trim()) {
    return {
      ok: false,
      error: 'This account uses social sign-in only. Use Google, LinkedIn, or GitHub instead.',
    }
  }
  const token = createVerificationToken()
  const extra = readProfileExtra(row)
  extra.passwordResetToken = token
  extra.passwordResetExpires = verificationExpiresAt()
  row.profileExtra = extra
  users[idx] = row
  writeUsers(users)
  return {
    ok: true,
    devResetLink: buildLocalPasswordResetLink(token),
    message: 'Open the reset link below to choose a new password (valid for 1 hour).',
  }
}

export async function resetLocalPassword(
  token: string,
  password: string,
  readUsers: () => Array<Record<string, unknown>>,
  writeUsers: (users: Array<Record<string, unknown>>) => void,
): Promise<{ ok: true; email: string } | { ok: false; error: string; expired?: boolean }> {
  const trimmed = String(token || '').trim()
  if (!trimmed) return { ok: false, error: 'Missing reset token.' }
  if (String(password || '').length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' }
  }
  const users = readUsers()
  const idx = users.findIndex(u => {
    const extra = readProfileExtra(u)
    return String(extra.passwordResetToken ?? '') === trimmed
  })
  if (idx < 0) return { ok: false, error: 'This reset link is invalid or expired.' }
  const row = { ...users[idx]! }
  const extra = readProfileExtra(row)
  if (isVerificationExpired(extra.passwordResetExpires)) {
    return { ok: false, expired: true, error: 'This reset link has expired. Request a new password reset.' }
  }
  delete extra.passwordResetToken
  delete extra.passwordResetExpires
  row.profileExtra = Object.keys(extra).length ? extra : undefined
  row.passwordHash = await sha256Hex(password)
  row.emailVerified = row.emailVerified !== false ? true : row.emailVerified
  users[idx] = row
  writeUsers(users)
  return { ok: true, email: normalizeEmail(String(row.email ?? '')) }
}
