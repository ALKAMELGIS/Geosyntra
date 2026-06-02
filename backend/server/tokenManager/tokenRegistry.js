/**
 * Canonical token names for the central registry.
 * Hostinger hPanel → Node.js App → process.env only (no VITE_* on server).
 */
export const TOKEN_REGISTRY = Object.freeze([
  {
    name: 'mapbox',
    label: 'Mapbox',
    category: 'maps',
    /** Hostinger hPanel MAPBOX only — never API Manager / SQLite / vault. */
    requiredInProduction: false,
    envOnly: true,
    envKeys: ['MAPBOX_TOKEN', 'MAPBOX', 'MAPBOX_ACCESS_TOKEN', 'MAPBOX_PUBLIC_TOKEN'],
    legacyBuiltin: null,
  },
  {
    name: 'arcgis',
    label: 'ArcGIS Portal',
    category: 'gis',
    requiredInProduction: false,
    envKeys: ['ARCGIS_PORTAL_TOKEN'],
    legacyBuiltin: 'arcgisPortalToken',
  },
  {
    name: 'sentinelhub',
    label: 'Sentinel Hub',
    category: 'earth_observation',
    requiredInProduction: false,
    envKeys: ['SENTINEL_HUB_ACCESS_TOKEN', 'SENTINEL_HUB_TOKEN', 'SENTINEL'],
    legacyBuiltin: 'sentinelHubAccessToken',
  },
  {
    name: 'sentinelhub_wms',
    label: 'Sentinel Hub WMS Instance',
    category: 'earth_observation',
    requiredInProduction: false,
    envKeys: ['SENTINEL_HUB_WMS_INSTANCE_ID'],
    legacyBuiltin: 'sentinelHubWmsInstanceId',
  },
  {
    name: 'openweathermap',
    label: 'OpenWeatherMap',
    category: 'weather',
    requiredInProduction: false,
    envKeys: ['OPENWEATHERMAP_API_KEY'],
    legacyBuiltin: 'openWeatherMapApiKey',
  },
  {
    name: 'gemini',
    label: 'Google Gemini',
    category: 'ai',
    requiredInProduction: true,
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_GEMINI_API_KEY'],
    legacyBuiltin: 'geminiApiKey',
  },
  {
    name: 'claude',
    label: 'Anthropic Claude',
    category: 'ai',
    requiredInProduction: false,
    envKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    legacyBuiltin: 'claudeApiKey',
  },
  {
    name: 'deepseek',
    label: 'DeepSeek',
    category: 'ai',
    requiredInProduction: false,
    envKeys: ['DEEPSEEK', 'DEEPSEEK_API_KEY'],
    legacyBuiltin: 'deepseekApiKey',
  },
  {
    name: 'openai',
    label: 'OpenAI',
    category: 'ai',
    requiredInProduction: true,
    envKeys: ['OPENAI', 'OPENAI_API_KEY'],
    legacyBuiltin: null,
  },
  {
    name: 'openrouteservice',
    label: 'OpenRouteService',
    category: 'routing',
    requiredInProduction: false,
    envKeys: ['OPENROUTESERVICE', 'OPENROUTESERVICE_API_KEY', 'ORS_API_KEY'],
    legacyBuiltin: 'orsApiKey',
  },
  {
    name: 'graphhopper',
    label: 'GraphHopper',
    category: 'routing',
    requiredInProduction: false,
    envKeys: ['GRAPHHOPPER_API_KEY'],
    legacyBuiltin: 'graphHopperApiKey',
  },
  {
    name: 'google_maps',
    label: 'Google Maps Platform',
    category: 'maps',
    requiredInProduction: false,
    envKeys: ['GOOGLE_MAPS_SERVER_API_KEY', 'GOOGLE_MAPS_API_KEY'],
    legacyBuiltin: null,
  },
])

export function registryEntry(name) {
  const n = String(name || '').trim().toLowerCase()
  return TOKEN_REGISTRY.find(t => t.name === n) ?? null
}

export function legacyBuiltinToTokenName(builtinKey) {
  const hit = TOKEN_REGISTRY.find(t => t.legacyBuiltin === builtinKey)
  return hit?.name ?? null
}

export function requiredProductionTokens() {
  return TOKEN_REGISTRY.filter(t => t.requiredInProduction)
}
