import { normalizeEmail } from '../auth'
import { getAdminUserByEmail, upsertAdminUser } from '../admin/adminUserStore'
import { listSystemOwnerEmails } from '../rbacPermissions'
import { sha256Hex } from '../sha256Hex'
import { isGeosyntraPublicSite, isStaticLocalAuthMode } from './localAuthVerification'

function allowStaticOwnerBootstrap(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  const localDev = h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
  return isStaticLocalAuthMode() || isGeosyntraPublicSite() || localDev
}

/** sha256('GeoSyntra-Admin-2026!') — static Pages default Owner password. */
export const STATIC_OWNER_DEFAULT_PASSWORD_SHA256 =
  '2e8f0c1fe3c4eb4bbf56bbcd70b65aec40bc4c2992f4071bab53514ce6252d69'

function resolveStaticOwnerEmail(): string {
  const fromEnv = String(import.meta.env.VITE_STATIC_OWNER_EMAIL || '').trim()
  if (fromEnv) return normalizeEmail(fromEnv)
  const owners = listSystemOwnerEmails()
  return owners[0] ? normalizeEmail(owners[0]) : 'admin@geosyntra.com'
}

function resolveStaticOwnerPassword(): string {
  const fromEnv = String(import.meta.env.VITE_STATIC_OWNER_BOOTSTRAP_PASSWORD || '').trim()
  if (fromEnv.length >= 12) return fromEnv
  return 'GeoSyntra-Admin-2026!'
}

/**
 * Synchronous seed — safe before first sign-in (no race with async bootstrap).
 * Returns true when the Owner row exists after this call.
 */
export function ensureStaticPlatformOwnerSync(): boolean {
  if (typeof window === 'undefined' || !allowStaticOwnerBootstrap()) return false

  const email = resolveStaticOwnerEmail()
  const existing = getAdminUserByEmail(email)
  const customPw = String(import.meta.env.VITE_STATIC_OWNER_BOOTSTRAP_PASSWORD || '').trim()
  const useDefaultPassword = customPw.length < 12

  if (existing?.passwordHash && String(existing.passwordHash).length > 0) {
    return true
  }

  if (useDefaultPassword) {
    upsertAdminUser({
      email,
      name: 'GeoSyntra Admin',
      role: 'Super Admin',
      status: 'Active',
      plan: 'Free',
      emailVerified: true,
      passwordHash: STATIC_OWNER_DEFAULT_PASSWORD_SHA256,
      profileExtra: { roleSlug: 'super_admin', systemOwner: true, source: 'static-bootstrap' },
    })
    return true
  }

  return false
}

/**
 * GitHub Pages / static hosting: seed Owner in localStorage when the auth API is unavailable.
 */
export async function ensureStaticPlatformOwner(): Promise<void> {
  if (ensureStaticPlatformOwnerSync()) return
  if (typeof window === 'undefined' || !allowStaticOwnerBootstrap()) return

  const email = resolveStaticOwnerEmail()
  if (getAdminUserByEmail(email)?.passwordHash) return

  const passwordHash = await sha256Hex(resolveStaticOwnerPassword())
  upsertAdminUser({
    email,
    name: 'GeoSyntra Admin',
    role: 'Super Admin',
    status: 'Active',
    plan: 'Free',
    emailVerified: true,
    passwordHash,
    profileExtra: { roleSlug: 'super_admin', systemOwner: true, source: 'static-bootstrap' },
  })
}
