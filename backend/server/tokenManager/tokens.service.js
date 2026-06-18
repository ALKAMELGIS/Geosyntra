/**
 * Central Token Manager — resolve secrets for server proxies only.
 */
import { resolveTokenEnvValue } from '../env.js'
import { readVaultFile } from '../apiSecretsPersistence.js'
import { registryEntry, TOKEN_REGISTRY, legacyBuiltinToTokenName } from './tokenRegistry.js'
import { platformEnvVar } from '../platformDataPaths.js'

/**
 * @param {ReturnType<import('./systemTokenStore.js').createSystemTokenStore>} store
 */
export function createTokenManagerService(store, { secretsFilePath } = {}) {
  async function getSystemToken(name) {
    const entry = registryEntry(name)
    if (!entry) return null

    /** Mapbox: Hostinger MAPBOX env only — no database or legacy vault. */
    if (entry.envOnly) {
      return resolveTokenEnvValue(entry.name)
    }

    /** Hostinger hPanel env wins when set — survives redeploy without stale SQLite overrides. */
    const fromEnv = resolveTokenEnvValue(entry.name)
    if (fromEnv) return fromEnv

    if (store?.ready) {
      const fromDb = await Promise.resolve(store.getDecrypted(entry.name))
      if (fromDb) return fromDb
    }

    if (secretsFilePath && entry.legacyBuiltin) {
      try {
        const { secrets } = readVaultFile(secretsFilePath)
        const v = secrets?.builtin?.[entry.legacyBuiltin]
        if (typeof v === 'string' && v.trim()) return v.trim()
      } catch {
        /* ignore */
      }
    }

    return null
  }

  async function listRegistryStatus() {
    const masked = store?.ready ? await Promise.resolve(store.listMasked()) : []
    return TOKEN_REGISTRY.map(meta => {
      const dbRow = masked.find(r => r.name === meta.name)
      const envConfigured = Boolean(resolveTokenEnvValue(meta.name))
      const dbConfigured = Boolean(dbRow?.configured)
      return {
        name: meta.name,
        label: meta.label,
        category: meta.category,
        active: dbRow ? dbRow.active : true,
        configured: envConfigured || dbConfigured,
        source: dbConfigured ? 'database' : envConfigured ? 'environment' : 'none',
      }
    })
  }

  async function listMaskedForAdmin() {
    const byName = new Map(
      (store?.ready ? await Promise.resolve(store.listMasked()) : []).map(r => [r.name, r]),
    )
    return TOKEN_REGISTRY.map(meta => {
      const row = byName.get(meta.name)
      const envConfigured = Boolean(resolveTokenEnvValue(meta.name))
      return {
        name: meta.name,
        label: meta.label,
        category: meta.category,
        active: row?.active ?? true,
        configured: Boolean(row?.configured) || envConfigured,
        masked: row?.masked || (envConfigured ? 'env••••' : ''),
        source: row?.configured ? 'database' : envConfigured ? 'environment' : 'none',
        expiresAt: row?.expiresAt ?? null,
        lastTestedAt: row?.lastTestedAt ?? null,
        lastTestOk: row?.lastTestOk ?? null,
        lastTestMessage: row?.lastTestMessage ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
        encrypted: row?.encrypted ?? Boolean(platformEnvVar('API_VAULT_MASTER_KEY')),
      }
    })
  }

  async function migrateFromLegacyVault(actorEmail) {
    if (!store?.ready || !secretsFilePath) return { ok: false, error: 'store_unavailable' }
    const { secrets } = readVaultFile(secretsFilePath)
    if (!secrets?.builtin) return { ok: true, migrated: 0 }
    let count = 0
    for (const [builtinKey, value] of Object.entries(secrets.builtin)) {
      if (typeof value !== 'string' || !value.trim()) continue
      const tokenName = legacyBuiltinToTokenName(builtinKey)
      if (!tokenName) continue
      const meta = registryEntry(tokenName)
      await Promise.resolve(
        store.upsert({
          name: tokenName,
          label: meta?.label || tokenName,
          category: meta?.category || 'integration',
          value: value.trim(),
          active: true,
          updatedBy: actorEmail,
        }),
      )
      store.appendAudit({
        tokenName,
        action: 'migrate_from_vault',
        actorEmail,
        detail: `builtin:${builtinKey}`,
      })
      count += 1
    }
    return { ok: true, migrated: count }
  }

  async function testToken(name) {
    const entry = registryEntry(name)
    if (!entry) return { ok: false, error: 'unknown_token' }
    const value = await getSystemToken(name)
    if (!value) return { ok: false, error: 'not_configured', message: 'No token in database or environment.' }

    try {
      if (entry.name === 'mapbox') {
        const res = await fetch(`https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(value)}`)
        return { ok: res.ok, message: res.ok ? 'Mapbox token accepted.' : `HTTP ${res.status}` }
      }
      if (entry.name === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${value}` },
        })
        return { ok: res.ok, message: res.ok ? 'OpenAI key accepted.' : `HTTP ${res.status}` }
      }
      if (entry.name === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}`,
        )
        return { ok: res.ok, message: res.ok ? 'Gemini key accepted.' : `HTTP ${res.status}` }
      }
      if (entry.name === 'openrouteservice') {
        const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
          method: 'POST',
          headers: { Authorization: value, 'Content-Type': 'application/json' },
          body: JSON.stringify({ coordinates: [[8.681495, 49.41461], [8.687872, 49.420318]] }),
        })
        return { ok: res.status === 200 || res.status === 400, message: res.ok ? 'ORS key accepted.' : `HTTP ${res.status}` }
      }
      return { ok: true, message: 'Token present (no automated probe for this provider).' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'test_failed' }
    }
  }

  return {
    getSystemToken,
    listRegistryStatus,
    listMaskedForAdmin,
    migrateFromLegacyVault,
    testToken,
  }
}
