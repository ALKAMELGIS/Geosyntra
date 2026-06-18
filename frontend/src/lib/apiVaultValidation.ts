/**
 * Best-effort live checks from the browser. Never logs secrets.
 * Many enterprise APIs block browser CORS — those return "skipped".
 */

import type { BuiltinSecretKey } from './apiSecretsServerPersistence'

export type VaultLiveCheckResult = 'ok' | 'error' | 'skipped'

export async function validateGraphHopperApiKeyLive(apiKey: string): Promise<VaultLiveCheckResult> {
  const k = apiKey.trim()
  if (!k) return 'skipped'
  try {
    const url = `https://graphhopper.com/api/1/info?key=${encodeURIComponent(k)}`
    const res = await fetch(url, { method: 'GET', referrerPolicy: 'no-referrer', cache: 'no-store' })
    if (res.status === 401 || res.status === 403) return 'error'
    return res.ok ? 'ok' : 'error'
  } catch {
    return k.length >= 12 ? 'skipped' : 'error'
  }
}

export async function validateOpenRouteServiceApiKeyLive(apiKey: string): Promise<VaultLiveCheckResult> {
  const k = apiKey.trim()
  if (!k) return 'skipped'
  try {
    const res = await fetch('https://api.openrouteservice.org/v2/status', {
      method: 'GET',
      headers: { Authorization: k, Accept: 'application/json' },
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
    if (res.status === 401 || res.status === 403) return 'error'
    return res.ok ? 'ok' : 'error'
  } catch {
    return k.length >= 16 ? 'skipped' : 'error'
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
    case 'openWeatherMapApiKey':
      return validateOpenWeatherApiKeyLive(value)
    case 'orsApiKey':
      return validateOpenRouteServiceApiKeyLive(value)
    case 'graphHopperApiKey':
      return validateGraphHopperApiKeyLive(value)
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
