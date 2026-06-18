import { isProductionDeployment } from '../bootstrapEnv.js'
import { isSystemOwnerEmail } from './systemOwnerEmails.js'
import { storeAwait } from '../storeAwait.js'

/** Matches frontend staticOwnerBootstrap default — dev only. */
export const DEV_DEFAULT_OWNER_PASSWORD = 'GeoSyntra-Admin-2026!'

/** Password used to seed system owners on API startup in non-production. */
export function resolveDevBootstrapOwnerPassword() {
  const fromEnv = String(
    process.env.RBAC_BOOTSTRAP_PASSWORD || process.env.GEOSYNTRA_OWNER_PASSWORD || '',
  ).trim()
  if (fromEnv.length >= 12) return fromEnv
  if (isProductionDeployment()) return ''
  return DEV_DEFAULT_OWNER_PASSWORD
}

/**
 * First sign-in for a configured system-owner email in development — creates the row
 * with the password the user typed (min 8 chars). Production never auto-creates accounts here.
 */
export async function tryDevSystemOwnerFirstLogin(store, email, password) {
  if (isProductionDeployment()) return null
  const em = String(email || '').trim().toLowerCase()
  const pwd = String(password || '')
  if (!isSystemOwnerEmail(em) || pwd.length < 8) return null
  if (await storeAwait(store.getUserByEmail?.(em))) return null

  const provisioned = await storeAwait(
    store.provisionUserByOwner({
      name: 'GeoSyntra Admin',
      email: em,
      password: pwd,
      role: 'Super Admin',
      status: 'Active',
      emailVerified: true,
      profileExtra: { roleSlug: 'super_admin', systemOwner: true, source: 'dev-first-login' },
      provisionedBy: 'dev-first-login',
    }),
  )
  if (!provisioned.ok) return null
  return storeAwait(store.loginUser(email, password))
}
