/**
 * Sync API token overrides with the Node backend (`backend/server/agri_api_secrets.json`)
 * so secrets survive frontend rebuilds and full app updates when the server data directory persists.
 */

import { persistArcgisPortalTokenInBrowser } from './arcgisPortalToken'
import { persistClaudeApiKeyInBrowser } from './claudeApiKey'
import { persistUserApiTokenValue } from './customUserApiTokens'
import { persistDeepseekApiKeyInBrowser } from './deepseekApiKey'
import { persistGeminiApiKeyInBrowser } from './geminiApiKey'
import { persistMapboxAccessTokenInBrowser } from './mapboxAccessToken'
import { persistSentinelHubAccessTokenInBrowser } from './sentinelHubAccessToken'
import { persistSentinelHubWmsInstanceIdInBrowser } from './sentinelHubWmsInstance'

export type BuiltinSecretKey =
  | 'mapboxToken'
  | 'arcgisPortalToken'
  | 'sentinelHubAccessToken'
  | 'sentinelHubWmsInstanceId'
  | 'geminiApiKey'
  | 'claudeApiKey'
  | 'deepseekApiKey'

export type ApiSecretsClientPatch = Partial<Record<BuiltinSecretKey, string>> & {
  customSlots?: Record<string, string>
}

export type ServerApiSecretsV3 = {
  version: 3
  builtin: Partial<Record<BuiltinSecretKey, string>>
  customSlots: Record<string, string>
}

const BUILTIN_PERSIST: Record<BuiltinSecretKey, (v: string) => void> = {
  mapboxToken: persistMapboxAccessTokenInBrowser,
  arcgisPortalToken: persistArcgisPortalTokenInBrowser,
  sentinelHubAccessToken: persistSentinelHubAccessTokenInBrowser,
  sentinelHubWmsInstanceId: persistSentinelHubWmsInstanceIdInBrowser,
  geminiApiKey: persistGeminiApiKeyInBrowser,
  claudeApiKey: persistClaudeApiKeyInBrowser,
  deepseekApiKey: persistDeepseekApiKeyInBrowser,
}

function optionalAuthHeaders(): HeadersInit {
  const raw = import.meta.env.VITE_AGRI_API_SECRETS_TOKEN
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return {}
  return { 'X-Agri-Api-Secrets-Token': t }
}

export function applyPersistedApiSecretsToBrowser(secrets: ServerApiSecretsV3): void {
  const builtin = secrets.builtin && typeof secrets.builtin === 'object' ? secrets.builtin : {}
  for (const [k, v] of Object.entries(builtin)) {
    const key = k as BuiltinSecretKey
    const fn = BUILTIN_PERSIST[key]
    if (!fn) continue
    const s = typeof v === 'string' ? v.trim() : ''
    // Never push empty strings from the server file into the browser — avoids wiping
    // locally saved tokens when the server store is partial, stale, or not yet written.
    if (!s) continue
    fn(s)
  }
  const slots = secrets.customSlots && typeof secrets.customSlots === 'object' ? secrets.customSlots : {}
  for (const [slotId, v] of Object.entries(slots)) {
    const s = typeof v === 'string' ? v.trim() : ''
    if (!slotId || !s) continue
    persistUserApiTokenValue(slotId, s)
  }
}

/** Load server-stored tokens into this browser (no-op if API unavailable or no file yet). */
export async function hydrateBrowserApiSecretsFromServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/system/api-secrets', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { ...optionalAuthHeaders() },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean; persisted?: boolean; secrets?: ServerApiSecretsV3 }
    if (!data?.ok || !data.persisted || !data.secrets) return false
    applyPersistedApiSecretsToBrowser(data.secrets)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('agri-api-secrets-hydrated'))
    }
    return true
  } catch {
    return false
  }
}

export type PersistApiSecretsResult = { ok: true } | { ok: false; error: string }

export async function persistApiSecretsPatchToServer(patch: ApiSecretsClientPatch): Promise<PersistApiSecretsResult> {
  try {
    const res = await fetch('/api/system/api-secrets', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...optionalAuthHeaders() },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      let msg = res.statusText
      try {
        const j = (await res.json()) as { error?: string }
        if (j?.error) msg = j.error
      } catch {
        // ignore
      }
      return { ok: false, error: msg }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network'
    return { ok: false, error: msg }
  }
}
