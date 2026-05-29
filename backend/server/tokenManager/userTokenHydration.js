/**
 * Runtime secrets for authenticated sessions — platform tokens (Owner-managed) for all users.
 */
import { registryEntry, TOKEN_REGISTRY } from './tokenRegistry.js'

/**
 * @param {ReturnType<import('./systemTokenStore.js').createSystemTokenStore>} systemStore
 */
export function buildPlatformSessionSecrets(systemStore) {
  const builtin = {}
  const customSlots = {}
  if (!systemStore?.ready) {
    return { version: 3, builtin, customSlots }
  }

  for (const meta of TOKEN_REGISTRY) {
    if (!meta.legacyBuiltin) continue
    const platform = systemStore.getDecrypted(meta.name)
    if (platform) builtin[meta.legacyBuiltin] = platform
  }

  return { version: 3, builtin, customSlots }
}

/**
 * Owner-only: include personal overrides from user_api_tokens when present.
 * @param {ReturnType<import('./userApiTokenStore.js').createUserApiTokenStore>} userStore
 * @param {ReturnType<import('./systemTokenStore.js').createSystemTokenStore>} systemStore
 */
export function buildSessionSecretsPayload(userStore, systemStore, { userId, isOwner = false }) {
  const base = buildPlatformSessionSecrets(systemStore)
  if (!isOwner || !userStore?.ready) return base

  const uid = Number(userId)
  if (!Number.isFinite(uid)) return base

  const builtin = { ...base.builtin }
  const customSlots = { ...base.customSlots }

  for (const row of userStore.listDecryptedForUser(uid)) {
    const meta = registryEntry(row.provider)
    if (meta?.legacyBuiltin) {
      builtin[meta.legacyBuiltin] = row.value
      continue
    }
    customSlots[row.provider] = row.value
  }

  return { version: 3, builtin, customSlots }
}
