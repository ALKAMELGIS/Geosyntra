import { createOrPromoteOwner } from './createOwnerAccount.js'
import { listSystemOwnerEmails } from './systemOwnerEmails.js'
import { resolveDevBootstrapOwnerPassword } from './devOwnerBootstrap.js'
import { storeAwait } from '../storeAwait.js'

/**
 * Create or repair system-owner accounts on server start when bootstrap password is set.
 * Uses RBAC_BOOTSTRAP_PASSWORD or GEOSYNTRA_OWNER_PASSWORD (min 12 chars).
 * In development, falls back to DEV_DEFAULT_OWNER_PASSWORD when env is unset.
 */
export async function ensureSystemOwnerAccounts(store) {
  const password = resolveDevBootstrapOwnerPassword()
  if (password.length < 12) {
    return { skipped: true, reason: 'password_not_set' }
  }

  const primary = String(process.env.RBAC_BOOTSTRAP_EMAIL || '').trim().toLowerCase()
  const emails = [...new Set([...(primary ? [primary] : []), ...listSystemOwnerEmails()])]
  const results = []

  for (const email of emails) {
    const existing = await storeAwait(store.getUserByEmail?.(email))
    const needsPassword = !existing || !String(existing.passwordHash || '').trim()
    if (existing && !needsPassword) {
      results.push({ email, ok: true, unchanged: true })
      continue
    }
    const r = await createOrPromoteOwner(store, {
      email,
      password,
      name: 'GeoSyntra Admin',
      allowWhenOtherOwnerExists: true,
    })
    results.push({ email, ...r })
    if (r.ok && (r.created || r.promoted)) {
      console.info('[rbac] System owner account ready:', email)
    }
  }

  return { ok: true, results }
}
