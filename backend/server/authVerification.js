import { randomBytes } from 'crypto'

export const VERIFICATION_TTL_MS = 60 * 60 * 1000 // 1 hour
export const RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds

/** @type {Map<string, number>} */
const resendLastSent = new Map()

export function generateVerificationToken() {
  return randomBytes(32).toString('hex')
}

export function verificationExpiresAt(fromMs = Date.now()) {
  return new Date(fromMs + VERIFICATION_TTL_MS).toISOString()
}

export function isVerificationExpired(expiresAt) {
  if (!expiresAt) return true
  const t = Date.parse(String(expiresAt))
  if (!Number.isFinite(t)) return true
  return t <= Date.now()
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

/**
 * @returns {{ ok: true } | { ok: false; retryAfterSec: number }}
 */
export function checkResendCooldown(email) {
  const key = normalizeEmail(email)
  const last = resendLastSent.get(key) || 0
  const elapsed = Date.now() - last
  if (elapsed < RESEND_COOLDOWN_MS) {
    return { ok: false, retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000) }
  }
  return { ok: true }
}

export function markResendSent(email) {
  resendLastSent.set(normalizeEmail(email), Date.now())
}
