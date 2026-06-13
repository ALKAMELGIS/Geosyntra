/**
 * Persist Hostinger / .env API keys into the platform DB when the registry row is empty.
 * Database wins once set; env fills gaps on first boot or after data-dir reset.
 */
import { resolveTokenEnvValue } from '../env.js'
import { TOKEN_REGISTRY } from './tokenRegistry.js'

/**
 * @param {ReturnType<import('./systemTokenStore.js').createSystemTokenStore>} tokenStore
 */
export async function syncEnvironmentTokensToDatabase(
  tokenStore,
  { updatedBy = 'system@env-sync', forceFromEnv = false } = {},
) {
  if (!tokenStore?.ready) return { ok: false, synced: 0, error: 'no_db' }
  let synced = 0
  for (const meta of TOKEN_REGISTRY) {
    if (meta.envOnly) continue
    const fromEnv = resolveTokenEnvValue(meta.name)
    if (!fromEnv) continue
    const existing = await Promise.resolve(tokenStore.getDecrypted(meta.name))
    if (existing && !forceFromEnv) continue
    if (existing === fromEnv && forceFromEnv) continue
    await Promise.resolve(
      tokenStore.upsert({
        name: meta.name,
        label: meta.label,
        category: meta.category,
        value: fromEnv,
        active: true,
        updatedBy,
      }),
    )
    tokenStore.appendAudit({
      tokenName: meta.name,
      action: 'env_bootstrap',
      actorEmail: updatedBy,
      detail: 'seeded from environment',
    })
    synced += 1
  }
  return { ok: true, synced }
}
