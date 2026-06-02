/**
 * Platform capability flags — no secret values; safe for all authenticated users.
 */
import { resolveTokenEnvValue } from '../env.js'
import { TOKEN_REGISTRY } from './tokenRegistry.js'

/**
 * @param {ReturnType<import('./systemTokenStore.js').createSystemTokenStore>} systemStore
 */
export function buildPlatformCapabilities(systemStore) {
  const byName = new Map(
    systemStore?.ready ? systemStore.listMasked().map(r => [r.name, r]) : [],
  )

  const providers = {}
  for (const meta of TOKEN_REGISTRY) {
    const row = byName.get(meta.name)
    const envConfigured = Boolean(resolveTokenEnvValue(meta.name))
    const dbConfigured = Boolean(row?.configured)
    const active = row ? row.active : true
    const configured = (dbConfigured || envConfigured) && active
    providers[meta.name] = {
      label: meta.label,
      category: meta.category,
      configured,
      active,
      legacyBuiltin: meta.legacyBuiltin ?? null,
      source: dbConfigured ? 'database' : envConfigured ? 'environment' : 'none',
    }
  }

  return {
    version: 1,
    providers,
    gemini: Boolean(providers.gemini?.configured),
    openai: Boolean(providers.openai?.configured),
    claude: Boolean(providers.claude?.configured),
    deepseek: Boolean(providers.deepseek?.configured),
    mapbox: Boolean(providers.mapbox?.configured),
    arcgis: Boolean(providers.arcgis?.configured),
    sentinelhub: Boolean(providers.sentinelhub?.configured),
    openrouteservice: Boolean(providers.openrouteservice?.configured),
    graphhopper: Boolean(providers.graphhopper?.configured),
    openweathermap: Boolean(providers.openweathermap?.configured),
  }
}
