import { getArcgisPortalTokenBrowserOverride, persistArcgisPortalTokenInBrowser } from './arcgisPortalToken'
import { getClaudeApiKeyBrowserOverride, persistClaudeApiKeyInBrowser } from './claudeApiKey'
import { getUserApiTokenValue, persistUserApiTokenValue } from './customUserApiTokens'
import { getDeepseekApiKeyBrowserOverride, persistDeepseekApiKeyInBrowser } from './deepseekApiKey'
import { getGeminiApiKeyBrowserOverride, persistGeminiApiKeyInBrowser } from './geminiApiKey'
import { getOpenWeatherMapApiKeyBrowserOverride, persistOpenWeatherMapApiKeyInBrowser } from './openWeatherMapApiKey'
import {
  getGraphHopperApiKeyBrowserOverride,
  persistGraphHopperApiKeyInBrowser,
} from './graphHopperApiKey'
import {
  getOpenRouteServiceApiKeyBrowserOverride,
  persistOpenRouteServiceApiKeyInBrowser,
} from './openRouteServiceApiKey'
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
import { canManagePlatformApiTokens } from './apiTokenOwnerPolicy'
import { formatApiTokenSaveError } from './apiTokenSaveErrors'
import { resolveProviderForTokenType } from './apiTokenProviderMap'
import { isPlatformOwnerUser, readAccessToken, readCurrentUser } from './auth'
import { isWorkspaceApiConfigured } from './apiClient'
import { upsertSystemToken } from './systemTokensApi'
import { upsertUserApiToken } from './userApiTokensApi'
import { runBuiltinVaultLiveCheck } from './apiVaultValidation'
import { mustUseApiGateway } from './platformTokenRuntime'
import {
  persistBuiltinBrowserOverride,
  readBuiltinBrowserOverride,
  shouldMirrorBuiltinSecretsInBrowser,
} from './builtinTokenBrowserPolicy'

const BUILTIN_GET: Record<BuiltinSecretKey, () => string> = {
  arcgisPortalToken: getArcgisPortalTokenBrowserOverride,
  openWeatherMapApiKey: getOpenWeatherMapApiKeyBrowserOverride,
  sentinelHubAccessToken: getSentinelHubAccessTokenBrowserOverride,
  sentinelHubWmsInstanceId: getSentinelHubWmsInstanceIdBrowserOverride,
  geminiApiKey: getGeminiApiKeyBrowserOverride,
  claudeApiKey: getClaudeApiKeyBrowserOverride,
  deepseekApiKey: getDeepseekApiKeyBrowserOverride,
  orsApiKey: getOpenRouteServiceApiKeyBrowserOverride,
  graphHopperApiKey: getGraphHopperApiKeyBrowserOverride,
}

const BUILTIN_PERSIST: Record<BuiltinSecretKey, (v: string) => void> = {
  arcgisPortalToken: persistArcgisPortalTokenInBrowser,
  openWeatherMapApiKey: persistOpenWeatherMapApiKeyInBrowser,
  sentinelHubAccessToken: persistSentinelHubAccessTokenInBrowser,
  sentinelHubWmsInstanceId: persistSentinelHubWmsInstanceIdInBrowser,
  geminiApiKey: persistGeminiApiKeyInBrowser,
  claudeApiKey: persistClaudeApiKeyInBrowser,
  deepseekApiKey: persistDeepseekApiKeyInBrowser,
  orsApiKey: persistOpenRouteServiceApiKeyInBrowser,
  graphHopperApiKey: persistGraphHopperApiKeyInBrowser,
}

function defFor(typeId: ApiTokenTypeId): ApiTokenTypeDef | undefined {
  return API_TOKEN_TYPE_BY_ID[typeId]
}

export function readApiTokenSecret(typeId: ApiTokenTypeId): string {
  const def = defFor(typeId)
  if (!def) return ''
  if (def.kind === 'builtin') {
    return readBuiltinBrowserOverride(() => BUILTIN_GET[def.builtinKey]() || '')
  }
  return getUserApiTokenValue(def.slotId)
}

export async function writeApiTokenSecret(
  typeId: ApiTokenTypeId,
  value: string,
): Promise<PersistApiSecretsResult> {
  if (!canManagePlatformApiTokens()) {
    return { ok: false, error: 'Only the platform Owner can add or change API tokens.' }
  }
  if (!readAccessToken()?.trim()) {
    return {
      ok: false,
      error: formatApiTokenSaveError('unauthorized'),
    }
  }
  if (mustUseApiGateway() && !isWorkspaceApiConfigured()) {
    return {
      ok: false,
      error: formatApiTokenSaveError('network'),
    }
  }
  const def = defFor(typeId)
  if (!def) return { ok: false, error: 'Unknown token type' }
  const trimmed = value.trim()
  if (!trimmed) return { ok: false, error: 'Empty secret value' }

  if (def.kind === 'builtin') {
    if (shouldMirrorBuiltinSecretsInBrowser()) {
      BUILTIN_PERSIST[def.builtinKey](trimmed)
    }
  } else {
    persistUserApiTokenValue(def.slotId, trimmed)
  }

  const provider = resolveProviderForTokenType(typeId)
  const me = readCurrentUser()

  let systemDb: { ok: boolean; error?: string } = { ok: false }
  if (isPlatformOwnerUser(me)) {
    systemDb = await upsertSystemToken(provider, trimmed)
  }

  const userDb = await upsertUserApiToken(provider, trimmed)

  if (systemDb.ok || userDb.ok) {
    const { syncUserApiTokensForSession } = await import('./userTokenSessionSync')
    void syncUserApiTokensForSession({ force: true })
    return { ok: true, synced: true }
  }

  const gatewayMode = mustUseApiGateway()
  let server: PersistApiSecretsResult = { ok: false, error: 'skipped' }
  if (!gatewayMode) {
    server = await persistApiSecretsPatchToServer(
      def.kind === 'builtin'
        ? { [def.builtinKey]: trimmed }
        : { customSlots: { [def.slotId]: trimmed } },
    )

    if (server.ok) {
      return { ok: true, synced: true }
    }
  }

  const primaryError = formatApiTokenSaveError(
    systemDb.error || userDb.error || (server.ok ? undefined : server.error) || 'Failed to save API token on the server.',
  )

  if (gatewayMode) {
    return { ok: false, error: primaryError }
  }

  const { probeApiVaultServer } = await import('./apiVaultPersistence')
  const vault = await probeApiVaultServer()
  if (vault.reachable && !vault.authFailed) {
    return { ok: false, error: primaryError }
  }

  return {
    ok: true,
    synced: false,
    warning: `${primaryError} Token saved in this browser only until the API is reachable.`,
  }
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
