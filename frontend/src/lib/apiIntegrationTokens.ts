import { getArcgisPortalTokenBrowserOverride, persistArcgisPortalTokenInBrowser } from './arcgisPortalToken'
import { getClaudeApiKeyBrowserOverride, persistClaudeApiKeyInBrowser } from './claudeApiKey'
import { getUserApiTokenValue, persistUserApiTokenValue } from './customUserApiTokens'
import { getDeepseekApiKeyBrowserOverride, persistDeepseekApiKeyInBrowser } from './deepseekApiKey'
import { getGeminiApiKeyBrowserOverride, persistGeminiApiKeyInBrowser } from './geminiApiKey'
import { getMapboxAccessTokenBrowserOverride, persistMapboxAccessTokenInBrowser } from './mapboxAccessToken'
import { getOpenWeatherMapApiKeyBrowserOverride, persistOpenWeatherMapApiKeyInBrowser } from './openWeatherMapApiKey'
import {
  getSentinelHubAccessTokenBrowserOverride,
  persistSentinelHubAccessTokenInBrowser,
} from './sentinelHubAccessToken'
import {
  getSentinelHubWmsInstanceIdBrowserOverride,
  persistSentinelHubWmsInstanceIdInBrowser,
} from './sentinelHubWmsInstance'
import type { ApiTokenTypeDef, ApiTokenTypeId } from './apiIntegrationTypes'
import { API_TOKEN_TYPE_BY_ID } from './apiIntegrationTypes'
import type { BuiltinSecretKey } from './apiSecretsServerPersistence'
import { persistApiSecretsPatchToServer, type PersistApiSecretsResult } from './apiSecretsServerPersistence'
import { runBuiltinVaultLiveCheck } from './apiVaultValidation'

const BUILTIN_GET: Record<BuiltinSecretKey, () => string> = {
  mapboxToken: getMapboxAccessTokenBrowserOverride,
  arcgisPortalToken: getArcgisPortalTokenBrowserOverride,
  openWeatherMapApiKey: getOpenWeatherMapApiKeyBrowserOverride,
  sentinelHubAccessToken: getSentinelHubAccessTokenBrowserOverride,
  sentinelHubWmsInstanceId: getSentinelHubWmsInstanceIdBrowserOverride,
  geminiApiKey: getGeminiApiKeyBrowserOverride,
  claudeApiKey: getClaudeApiKeyBrowserOverride,
  deepseekApiKey: getDeepseekApiKeyBrowserOverride,
}

const BUILTIN_PERSIST: Record<BuiltinSecretKey, (v: string) => void> = {
  mapboxToken: persistMapboxAccessTokenInBrowser,
  arcgisPortalToken: persistArcgisPortalTokenInBrowser,
  openWeatherMapApiKey: persistOpenWeatherMapApiKeyInBrowser,
  sentinelHubAccessToken: persistSentinelHubAccessTokenInBrowser,
  sentinelHubWmsInstanceId: persistSentinelHubWmsInstanceIdInBrowser,
  geminiApiKey: persistGeminiApiKeyInBrowser,
  claudeApiKey: persistClaudeApiKeyInBrowser,
  deepseekApiKey: persistDeepseekApiKeyInBrowser,
}

function defFor(typeId: ApiTokenTypeId): ApiTokenTypeDef | undefined {
  return API_TOKEN_TYPE_BY_ID[typeId]
}

export function readApiTokenSecret(typeId: ApiTokenTypeId): string {
  const def = defFor(typeId)
  if (!def) return ''
  if (def.kind === 'builtin') return BUILTIN_GET[def.builtinKey]() || ''
  return getUserApiTokenValue(def.slotId)
}

export async function writeApiTokenSecret(
  typeId: ApiTokenTypeId,
  value: string,
): Promise<PersistApiSecretsResult> {
  const def = defFor(typeId)
  if (!def) return { ok: false, error: 'Unknown token type' }
  const trimmed = value.trim()

  if (def.kind === 'builtin') {
    BUILTIN_PERSIST[def.builtinKey](trimmed)
    return persistApiSecretsPatchToServer({ [def.builtinKey]: trimmed })
  }

  persistUserApiTokenValue(def.slotId, trimmed)
  return persistApiSecretsPatchToServer({ customSlots: { [def.slotId]: trimmed } })
}

export async function testApiTokenSecret(typeId: ApiTokenTypeId, value: string) {
  const def = defFor(typeId)
  if (!def) return 'error' as const
  if (def.kind === 'builtin') {
    return runBuiltinVaultLiveCheck(def.builtinKey, value)
  }
  const v = value.trim()
  if (!v) return 'skipped' as const
  if (typeId === 'databaseConnectionUri') {
    try {
      const u = new URL(v)
      return u.protocol === 'postgresql:' || u.protocol === 'mysql:' || u.protocol === 'mongodb:' ? 'ok' : 'skipped'
    } catch {
      return 'error' as const
    }
  }
  return v.length >= 8 ? 'ok' : 'error'
}
