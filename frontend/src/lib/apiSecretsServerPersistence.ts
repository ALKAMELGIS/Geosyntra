/**
 * Sync API token overrides with the Node backend (`geosyntra_api_secrets.json`)
 * so secrets survive frontend rebuilds and full app updates when the server data directory persists.
 */

import { getArcgisPortalTokenBrowserOverride, persistArcgisPortalTokenInBrowser } from './arcgisPortalToken'
import { getClaudeApiKeyBrowserOverride, persistClaudeApiKeyInBrowser } from './claudeApiKey'
import { getUserApiTokenValue, persistUserApiTokenValue } from './customUserApiTokens'
import { getDeepseekApiKeyBrowserOverride, persistDeepseekApiKeyInBrowser } from './deepseekApiKey'
import { getGeminiApiKeyBrowserOverride, persistGeminiApiKeyInBrowser } from './geminiApiKey'
import { getOpenWeatherMapApiKeyBrowserOverride, persistOpenWeatherMapApiKeyInBrowser } from './openWeatherMapApiKey'
import {
  getSentinelHubAccessTokenBrowserOverride,
  persistSentinelHubAccessTokenInBrowser,
} from './sentinelHubAccessToken'
import {
  getSentinelHubWmsInstanceIdBrowserOverride,
  persistSentinelHubWmsInstanceIdInBrowser,
} from './sentinelHubWmsInstance'
import {
  getGraphHopperApiKeyBrowserOverride,
  persistGraphHopperApiKeyInBrowser,
} from './graphHopperApiKey'
import {
  getOpenRouteServiceApiKeyBrowserOverride,
  persistOpenRouteServiceApiKeyInBrowser,
} from './openRouteServiceApiKey'
import { resolveApiUrl, authHeaders as workspaceAuthHeaders } from './apiClient'
import { mustUseApiGateway } from './platformTokenRuntime'
import { vitePlatformEnv } from './platformViteEnv'

export type BuiltinSecretKey =
  | 'arcgisPortalToken'
  | 'openWeatherMapApiKey'
  | 'sentinelHubAccessToken'
  | 'sentinelHubWmsInstanceId'
  | 'geminiApiKey'
  | 'claudeApiKey'
  | 'deepseekApiKey'
  | 'orsApiKey'
  | 'graphHopperApiKey'

export type ApiSecretsClientPatch = Partial<Record<BuiltinSecretKey, string>> & {
  customSlots?: Record<string, string>
}

export type ServerApiSecretsV3 = {
  version: 3
  builtin: Partial<Record<BuiltinSecretKey, string>>
  customSlots: Record<string, string>
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

/** Current browser-only values (never clobber these with an empty server response). */
const BUILTIN_BROWSER_GET: Record<BuiltinSecretKey, () => string> = {
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

function vaultRequestHeaders(): HeadersInit {
  const legacy = vitePlatformEnv('API_SECRETS_TOKEN')
  const h: Record<string, string> = { ...(workspaceAuthHeaders() as Record<string, string>) }
  if (legacy) h['X-Agri-Api-Secrets-Token'] = legacy
  return h
}

/** Remote API base for vault routes (GitHub Pages → api.geosyntra.org). */
export function getApiSecretsEndpoint(): string {
  const u = vitePlatformEnv('API_SECRETS_URL').replace(/\/$/, '')
  if (u) return u
  return resolveApiUrl('/api/system/api-secrets')
}

export function applyPersistedApiSecretsToBrowser(secrets: ServerApiSecretsV3): void {
  const builtin = secrets.builtin && typeof secrets.builtin === 'object' ? secrets.builtin : {}
  for (const [k, v] of Object.entries(builtin)) {
    const key = k as BuiltinSecretKey
    const fn = BUILTIN_PERSIST[key]
    if (!fn) continue
    const nextValue = typeof v === 'string' ? v : ''
    /**
     * Never wipe an existing browser token with an empty/missing server value.
     * Applies after deploys when `geosyntra_api_secrets.json` is missing, reset, or not yet synced,
     * and for static/GitHub Pages builds without a reachable secrets API.
     */
    const getBrowser = BUILTIN_BROWSER_GET[key]
    if (!nextValue.trim() && getBrowser?.().trim()) {
      continue
    }
    fn(nextValue)
  }
  const slots = secrets.customSlots && typeof secrets.customSlots === 'object' ? secrets.customSlots : {}
  for (const [slotId, v] of Object.entries(slots)) {
    const nextValue = typeof v === 'string' ? v : ''
    if (!nextValue.trim() && getUserApiTokenValue(slotId).trim()) {
      continue
    }
    persistUserApiTokenValue(slotId, nextValue)
  }
}

/** Load server-stored tokens into this browser (no-op if API unavailable or no file yet). */
export async function hydrateBrowserApiSecretsFromServer(): Promise<boolean> {
  const { clientApiSecretsHydrationEnabled } = await import('./systemTokensApi')
  if (!clientApiSecretsHydrationEnabled()) return false
  try {
    const res = await fetch(getApiSecretsEndpoint(), {
      method: 'GET',
      credentials: 'include',
      headers: vaultRequestHeaders(),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean; persisted?: boolean; secrets?: ServerApiSecretsV3 }
    if (!data?.ok || !data.persisted || !data.secrets) return false
    applyPersistedApiSecretsToBrowser(data.secrets)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('geosyntra-api-secrets-hydrated'))
    }
    return true
  } catch {
    return false
  }
}

export type PersistApiSecretsResult =
  | { ok: true; synced?: boolean; warning?: string }
  | { ok: false; error: string }

export async function persistApiSecretsPatchToServer(patch: ApiSecretsClientPatch): Promise<PersistApiSecretsResult> {
  try {
    const res = await fetch(getApiSecretsEndpoint(), {
      method: 'PUT',
      credentials: 'include',
      headers: vaultRequestHeaders(),
      body: JSON.stringify(patch),
    })
    let data: { ok?: boolean; persisted?: boolean; secrets?: ServerApiSecretsV3; error?: string } = {}
    try {
      data = (await res.json()) as typeof data
    } catch {
      // non-JSON error body
    }
    if (!res.ok) {
      return { ok: false, error: data?.error || res.statusText }
    }
    /**
     * PUT must return a persisted snapshot; otherwise the write did not land (wrong host, HTML error page,
     * or API not registered). Do not report success — that made vault saves look "permanent" while only localStorage updated.
     */
    const gatewayMode = mustUseApiGateway()
    if (!data?.ok || !data.persisted) {
      return {
        ok: false,
        error:
          data?.error ||
          'API secrets endpoint returned no persisted snapshot (run the Node backend, enable the /api proxy, or set VITE_GEOSYNTRA_API_SECRETS_URL).',
      }
    }
    if (!data.secrets && !gatewayMode) {
      return {
        ok: false,
        error:
          data?.error ||
          'API secrets endpoint returned no persisted snapshot (run the Node backend, enable the /api proxy, or set VITE_GEOSYNTRA_API_SECRETS_URL).',
      }
    }
    /**
     * Authoritative copy lives on disk (`geosyntra_api_secrets.json` or `GEOSYNTRA_API_SECRETS_FILE`);
     * merge the returned snapshot into this browser so tokens match the server for any device/browser.
     */
    if (data.secrets) {
      applyPersistedApiSecretsToBrowser(data.secrets)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('geosyntra-api-secrets-hydrated'))
      }
    }
    return { ok: true, synced: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network'
    return { ok: false, error: msg }
  }
}
