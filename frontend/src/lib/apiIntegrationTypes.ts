import type { BuiltinSecretKey } from './apiSecretsServerPersistence'

/** Stable ids — Type dropdown shows `label` only (clean token names). */
export type ApiTokenTypeId =
  | 'mapboxIntegration'
  | 'arcgisPortalToken'
  | 'openWeatherMapApiKey'
  | 'sentinelHubAccessToken'
  | 'sentinelHubWmsInstanceId'
  | 'geminiApiKey'
  | 'deepseekApiKey'
  | 'claudeApiKey'
  | 'orsApiKey'
  | 'graphHopperApiKey'
  | 'openaiApiKey'
  | 'cesiumIonToken'
  | 'planetLabsApiKey'
  | 'nasaEarthDataToken'
  | 'databaseConnectionUri'
  | 'googleMapsApiKey'

export type ApiTokenTypeDef =
  | { id: ApiTokenTypeId; label: string; kind: 'builtin'; builtinKey: BuiltinSecretKey }
  | { id: ApiTokenTypeId; label: string; kind: 'custom'; slotId: string }

export const API_TOKEN_TYPES: readonly ApiTokenTypeDef[] = [
  { id: 'arcgisPortalToken', label: 'ArcGIS / Portal Token', kind: 'builtin', builtinKey: 'arcgisPortalToken' },
  { id: 'openWeatherMapApiKey', label: 'OpenWeatherMap API Key', kind: 'builtin', builtinKey: 'openWeatherMapApiKey' },
  { id: 'sentinelHubAccessToken', label: 'Sentinel Hub OAuth Token', kind: 'builtin', builtinKey: 'sentinelHubAccessToken' },
  { id: 'sentinelHubWmsInstanceId', label: 'Sentinel Hub WMS Instance ID', kind: 'builtin', builtinKey: 'sentinelHubWmsInstanceId' },
  { id: 'geminiApiKey', label: 'Google Gemini API Key', kind: 'builtin', builtinKey: 'geminiApiKey' },
  { id: 'deepseekApiKey', label: 'DeepSeek API Key', kind: 'builtin', builtinKey: 'deepseekApiKey' },
  { id: 'claudeApiKey', label: 'Claude API Key (Anthropic)', kind: 'builtin', builtinKey: 'claudeApiKey' },
  {
    id: 'orsApiKey',
    label: 'OpenRouteService (ORS_API_KEY)',
    kind: 'builtin',
    builtinKey: 'orsApiKey',
  },
  {
    id: 'graphHopperApiKey',
    label: 'GraphHopper API Key',
    kind: 'builtin',
    builtinKey: 'graphHopperApiKey',
  },
  { id: 'openaiApiKey', label: 'OpenAI API Key', kind: 'custom', slotId: 'openaiApiKey' },
  { id: 'cesiumIonToken', label: 'Cesium Ion Token', kind: 'custom', slotId: 'cesiumIonToken' },
  { id: 'planetLabsApiKey', label: 'Planet Labs API Key', kind: 'custom', slotId: 'planetLabsApiKey' },
  { id: 'nasaEarthDataToken', label: 'NASA EarthData Token', kind: 'custom', slotId: 'nasaEarthDataToken' },
  { id: 'databaseConnectionUri', label: 'Database Connection URI', kind: 'custom', slotId: 'databaseConnectionUri' },
  { id: 'googleMapsApiKey', label: 'Google Map API', kind: 'custom', slotId: 'googleMapsApiKey' },
] as const

export const API_TOKEN_TYPE_BY_ID: Record<ApiTokenTypeId, ApiTokenTypeDef> = Object.fromEntries(
  API_TOKEN_TYPES.map(t => [t.id, t]),
) as Record<ApiTokenTypeId, ApiTokenTypeDef>

export function labelForApiTokenType(id: ApiTokenTypeId): string {
  return API_TOKEN_TYPE_BY_ID[id]?.label ?? id
}

export type ApiIntegrationRecord = {
  id: string
  name: string
  typeId: ApiTokenTypeId
  provider: string
  baseUrl: string
  pollingMinutes: number
  active: boolean
  notes: string
  createdAt: string
  updatedAt: string
}
