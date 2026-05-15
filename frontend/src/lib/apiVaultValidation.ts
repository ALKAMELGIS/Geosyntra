/**
 * Best-effort live checks from the browser. Never logs secrets.
 * Many enterprise APIs block browser CORS — those return "skipped".
 */

import type { BuiltinSecretKey } from './apiSecretsServerPersistence'

export type VaultLiveCheckResult = 'ok' | 'error' | 'skipped'

export async function validateMapboxAccessTokenLive(token: string): Promise<VaultLiveCheckResult> {
  const t = token.trim()
  if (!t) return 'skipped'
  try {
    const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(t)}`
    const res = await fetch(url, { method: 'GET', referrerPolicy: 'no-referrer', cache: 'no-store' })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function validateOpenWeatherApiKeyLive(apiKey: string): Promise<VaultLiveCheckResult> {
  const k = apiKey.trim()
  if (!k) return 'skipped'
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=London&units=metric&appid=${encodeURIComponent(k)}`
    const res = await fetch(url, { method: 'GET', referrerPolicy: 'no-referrer', cache: 'no-store' })
    if (res.status === 401 || res.status === 403) return 'error'
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

/** Presence / shape only — no outbound call (CORS / portal URL unknown). */
export function validateSentinelInstanceIdShape(id: string): VaultLiveCheckResult {
  const s = id.trim()
  if (!s) return 'skipped'
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? 'ok' : 'error'
}

export async function runBuiltinVaultLiveCheck(
  key: BuiltinSecretKey,
  value: string,
): Promise<VaultLiveCheckResult> {
  switch (key) {
    case 'mapboxToken':
      return validateMapboxAccessTokenLive(value)
    case 'openWeatherMapApiKey':
      return validateOpenWeatherApiKeyLive(value)
    case 'sentinelHubWmsInstanceId':
      return validateSentinelInstanceIdShape(value)
    case 'sentinelHubAccessToken':
    case 'arcgisPortalToken':
    case 'geminiApiKey':
    case 'claudeApiKey':
    case 'deepseekApiKey':
      return 'skipped'
    default:
      return 'skipped'
  }
}
