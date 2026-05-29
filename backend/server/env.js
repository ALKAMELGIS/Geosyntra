/**
 * Unified server environment — Hostinger hPanel → process.env → token registry.
 * Single source of truth for API keys on the Node backend (never exposed via VITE_*).
 */
import { TOKEN_REGISTRY, registryEntry, requiredProductionTokens } from './tokenManager/tokenRegistry.js'

/** Hostinger hPanel canonical names (first alias in each token's envKeys). */
export const HOSTINGER_ENV_HINTS = Object.freeze(
  Object.fromEntries(
    TOKEN_REGISTRY.map(meta => [meta.name, meta.envKeys[0]]),
  ),
)

/**
 * @param {readonly string[]} keys
 * @returns {{ envKey: string, value: string } | null}
 */
export function normalizeEnvSecret(raw) {
  if (typeof raw !== 'string') return null
  let value = raw.trim()
  if (!value) return null
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }
  return value || null
}

export function pickFirstEnv(keys) {
  for (const key of keys) {
    const value = normalizeEnvSecret(process.env[key])
    if (value) {
      return { envKey: key, value }
    }
  }
  return null
}

/**
 * Resolve a platform token value from Hostinger / local .env (no database).
 * @param {string} tokenName
 */
export function resolveTokenEnvValue(tokenName) {
  const entry = registryEntry(tokenName)
  if (!entry) return null
  return pickFirstEnv(entry.envKeys)?.value ?? null
}

/** Public pk.* for Mapbox GL in the browser — scans MAPBOX_PUBLIC_TOKEN then all mapbox env aliases. */
export function resolveMapboxPublicTokenEnv() {
  const dedicated = normalizeEnvSecret(process.env.MAPBOX_PUBLIC_TOKEN)
  if (dedicated?.startsWith('pk.')) return dedicated

  const entry = registryEntry('mapbox')
  if (!entry) return null
  for (const key of entry.envKeys) {
    const value = normalizeEnvSecret(process.env[key])
    if (value?.startsWith('pk.')) return value
  }
  return null
}

/**
 * @param {readonly string[]} keys
 * @returns {string | null} first matching env key name
 */
export function resolveEnvFromGroup(keys) {
  return pickFirstEnv(keys)?.envKey ?? null
}

/** Required production groups derived from TOKEN_REGISTRY (single source of truth). */
export function getRequiredProductionEnvGroups() {
  return requiredProductionTokens().map(meta => ({
    name: meta.envKeys[0],
    tokenName: meta.name,
    keys: meta.envKeys,
  }))
}

/**
 * Safe audit for logs and /api/platform/env-health (no secret values).
 */
export function auditEnvironmentBindings() {
  return TOKEN_REGISTRY.map(meta => {
    const hit = pickFirstEnv(meta.envKeys)
    return {
      name: meta.name,
      label: meta.label,
      category: meta.category,
      requiredInProduction: Boolean(meta.requiredInProduction),
      configured: Boolean(hit),
      envKey: hit?.envKey ?? null,
      hint: HOSTINGER_ENV_HINTS[meta.name] ?? meta.envKeys[0],
    }
  })
}

/**
 * @param {readonly { name: string, keys: readonly string[], tokenName?: string }[]} requiredGroups
 */
export function auditRequiredEnvGroups(requiredGroups) {
  const missing = []
  const present = []
  for (const group of requiredGroups) {
    const envKey = resolveEnvFromGroup(group.keys)
    if (!envKey) missing.push(group.name)
    else present.push({ canonical: group.name, envKey, tokenName: group.tokenName ?? null })
  }
  return { missing, present }
}

export function auditRequiredProductionEnv() {
  return auditRequiredEnvGroups(getRequiredProductionEnvGroups())
}

/**
 * Fatal startup validation — production Hostinger must expose required API keys via process.env.
 */
export function validateProductionStartup() {
  const { missing, present } = auditRequiredProductionEnv()
  if (missing.length === 0) {
    return { ok: true, missing: [], present }
  }

  console.error(
    '\n[env] FATAL — required API keys missing from Hostinger Node.js Environment Variables:\n',
  )
  for (const name of missing) {
    const group = getRequiredProductionEnvGroups().find(g => g.name === name)
    const aliases = group ? group.keys.join(' or ') : name
    console.error(`  • ${name}  (set ${aliases} in hPanel → Node.js → Environment Variables)`)
  }
  console.error(
    '\nAPI secrets must live on the server only — never in frontend VITE_* vars, localStorage, or Git.',
  )
  console.error('Save variables in hPanel, then Restart the Node.js application.\n')
  process.exit(1)
}

export function logEnvironmentBindings() {
  const rows = auditEnvironmentBindings()
  const configured = rows.filter(r => r.configured)
  const requiredMissing = rows.filter(r => r.requiredInProduction && !r.configured)
  console.log(`[env] ${configured.length}/${TOKEN_REGISTRY.length} integration key(s) bound from process.env`)
  for (const row of configured) {
    const tag = row.requiredInProduction ? 'required' : 'optional'
    console.log(`[env]   ✓ ${row.name} (${row.envKey}) [${tag}]`)
  }
  if (requiredMissing.length) {
    console.error('[env]   ✗ required but missing:', requiredMissing.map(r => r.name).join(', '))
  }
  const optionalMissing = rows.filter(r => !r.requiredInProduction && !r.configured)
  if (optionalMissing.length) {
    console.log('[env]   — optional unset:', optionalMissing.map(r => r.name).join(', '))
  }
}

/**
 * Mapbox platform token — Hostinger MAPBOX env only. Logs clearly; never blocks server startup.
 */
export function validateMapboxEnvStartup() {
  const value = resolveTokenEnvValue('mapbox')
  const publicPk = resolveMapboxPublicTokenEnv()
  if (value || publicPk) {
    console.log(
      `[mapbox] MAPBOX configured in process.env — proxy: ${Boolean(value || publicPk)}, public pk for GL: ${Boolean(publicPk)}`,
    )
    return { ok: true, configured: true, hasPublicToken: Boolean(publicPk) }
  }
  console.error(
    '[mapbox] ERROR: MAPBOX_TOKEN is not set. Add MAPBOX_TOKEN (public pk.* or secret sk.*) in Hostinger hPanel → geosyntra.org → Environment Variables, then Restart the Node.js app. Esri/OSM basemaps still work; Mapbox tiles and geocoding are disabled.',
  )
  return { ok: false, configured: false }
}
