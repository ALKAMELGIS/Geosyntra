import type { ApiTokenTypeId } from './apiIntegrationTypes'
import { API_TOKEN_TYPE_BY_ID } from './apiIntegrationTypes'
import type { BuiltinSecretKey } from './apiSecretsServerPersistence'

/** Maps integration type ids / vault builtin keys to central registry provider names. */
const TYPE_TO_PROVIDER: Partial<Record<ApiTokenTypeId, string>> = {
  arcgisPortalToken: 'arcgis',
  openWeatherMapApiKey: 'openweathermap',
  sentinelHubAccessToken: 'sentinelhub',
  sentinelHubWmsInstanceId: 'sentinelhub_wms',
  geminiApiKey: 'gemini',
  claudeApiKey: 'claude',
  deepseekApiKey: 'deepseek',
  orsApiKey: 'openrouteservice',
  graphHopperApiKey: 'graphhopper',
}

const BUILTIN_TO_PROVIDER: Record<BuiltinSecretKey, string> = {
  arcgisPortalToken: 'arcgis',
  openWeatherMapApiKey: 'openweathermap',
  sentinelHubAccessToken: 'sentinelhub',
  sentinelHubWmsInstanceId: 'sentinelhub_wms',
  geminiApiKey: 'gemini',
  claudeApiKey: 'claude',
  deepseekApiKey: 'deepseek',
  orsApiKey: 'openrouteservice',
  graphHopperApiKey: 'graphhopper',
}

export function apiTokenTypeIdToProvider(typeId: ApiTokenTypeId): string {
  return TYPE_TO_PROVIDER[typeId] ?? typeId
}

export function builtinSecretKeyToProvider(key: BuiltinSecretKey): string {
  return BUILTIN_TO_PROVIDER[key] ?? key
}

export function resolveProviderForTokenType(typeId: ApiTokenTypeId): string {
  const def = API_TOKEN_TYPE_BY_ID[typeId]
  if (!def) return typeId
  if (def.kind === 'builtin') return builtinSecretKeyToProvider(def.builtinKey)
  return def.slotId
}
