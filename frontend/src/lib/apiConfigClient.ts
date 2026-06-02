/**
 * Platform config from Hostinger-backed Node API — no VITE_* secrets in the browser.
 */
import { resolveApiUrl } from './apiClient'
import { readAccessToken } from './auth'
import type { PlatformCapabilities } from './platformTokenRuntime'

function authHeaders(): HeadersInit {
  const token = readAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function configFetch<T>(path: string): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(resolveApiUrl(path), {
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json().catch(() => ({}))) as T
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: {} as T }
  }
}

export async function fetchPlatformConfigStatus(): Promise<{
  ok: boolean
  revision?: number
  capabilities?: PlatformCapabilities
  error?: string
}> {
  const { ok, data } = await configFetch<{
    ok?: boolean
    revision?: number
    capabilities?: PlatformCapabilities
    error?: string
  }>('/api/config/status')
  if (!ok) return { ok: false, error: data?.error || 'config_status_failed' }
  return { ok: true, revision: data.revision, capabilities: data.capabilities }
}

export async function fetchMapboxConfigFromApi(): Promise<{
  ok: boolean
  configured?: boolean
  token?: string | null
  proxyMode?: boolean
  publicOnly?: boolean
  gatewayPath?: string
  error?: string
}> {
  try {
    const res = await fetch(resolveApiUrl('/api/config/mapbox'), {
      headers: { Accept: 'application/json' },
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      configured?: boolean
      token?: string | null
      proxyMode?: boolean
      publicOnly?: boolean
      gatewayPath?: string
      error?: string
    }
    if (!res.ok) return { ok: false, error: data?.error || 'mapbox_config_failed' }
    return {
      ok: true,
      configured: data.configured ?? false,
      token: data.token ?? null,
      proxyMode: data.proxyMode ?? false,
      publicOnly: data.publicOnly ?? false,
      gatewayPath: data.gatewayPath,
    }
  } catch {
    return { ok: false, error: 'mapbox_config_network_error' }
  }
}

export async function fetchSentinelGatewayCredentials(): Promise<{
  ok: boolean
  accessToken?: string | null
  wmsInstanceId?: string | null
  error?: string
}> {
  const { ok, data } = await configFetch<{
    ok?: boolean
    accessToken?: string | null
    wmsInstanceId?: string | null
    error?: string
  }>('/api/gateway/sentinel/credentials')
  if (!ok) return { ok: false, error: data?.error || 'sentinel_not_configured' }
  return {
    ok: true,
    accessToken: data.accessToken ?? null,
    wmsInstanceId: data.wmsInstanceId ?? null,
  }
}

export async function fetchSentinelConfigFromApi(): Promise<{
  ok: boolean
  configured?: boolean
  gatewayPath?: string
  error?: string
}> {
  const { ok, data } = await configFetch<{
    ok?: boolean
    configured?: boolean
    gatewayPath?: string
    error?: string
  }>('/api/config/sentinel')
  if (!ok) return { ok: false, error: data?.error || 'sentinel_config_failed' }
  return { ok: true, configured: data.configured, gatewayPath: data.gatewayPath }
}

export async function fetchProviderConfigFromApi(
  provider: 'gemini' | 'openai' | 'claude' | 'deepseek' | 'openrouteservice' | 'graphhopper',
): Promise<{ ok: boolean; configured?: boolean; gatewayPath?: string; error?: string }> {
  const { ok, data } = await configFetch<{
    ok?: boolean
    configured?: boolean
    gatewayPath?: string
    error?: string
  }>(`/api/config/${provider}`)
  if (!ok) return { ok: false, error: data?.error || 'provider_config_failed' }
  return { ok: true, configured: data.configured, gatewayPath: data.gatewayPath }
}

/** Hydrate runtime capabilities — secrets fetched via gateway endpoints only. */
export async function hydratePlatformConfigFromServer(): Promise<{
  ok: boolean
  capabilities?: PlatformCapabilities
  mapboxConfigured?: boolean
  sentinelAccessToken?: string | null
  sentinelWmsInstanceId?: string | null
  revision?: number
  error?: string
}> {
  const statusRes = await fetchPlatformConfigStatus()
  if (!statusRes.ok) return { ok: false, error: statusRes.error }

  const [mapRes, sentinelMeta, sentinelCreds] = await Promise.all([
    fetchMapboxConfigFromApi(),
    fetchSentinelConfigFromApi(),
    fetchSentinelGatewayCredentials(),
  ])

  return {
    ok: true,
    capabilities: statusRes.capabilities,
    revision: statusRes.revision,
    mapboxConfigured: mapRes.configured,
    sentinelAccessToken:
      sentinelMeta.configured && sentinelCreds.ok ? sentinelCreds.accessToken ?? null : null,
    sentinelWmsInstanceId:
      sentinelMeta.configured && sentinelCreds.ok ? sentinelCreds.wmsInstanceId ?? null : null,
  }
}
