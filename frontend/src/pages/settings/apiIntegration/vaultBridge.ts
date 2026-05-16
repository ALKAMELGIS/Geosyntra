import type { ApiTokenTypeId } from '../../../lib/apiIntegrationTypes'
import { API_TOKEN_TYPE_BY_ID } from '../../../lib/apiIntegrationTypes'
import {
  readApiTokenSecret,
  testApiTokenSecret,
  writeApiTokenSecret,
} from '../../../lib/apiIntegrationTokens'
import { fetchSentinelHubWmsLayers } from '../../../lib/sentinelHubWmsCapabilities'
import { resolveSentinelHubInstanceId } from '../../../lib/sentinelHubIntegrationSync'
import { persistSentinelHubWmsInstanceIdInBrowser } from '../../../lib/sentinelHubWmsInstance'
import type { ProviderId } from './types'
import type { AuthType } from './types'
import { getProvider } from './providers/registry'
import { primarySecretKey } from './providers/validate'

/** Never log secret values — mask for display only. */
export function maskSecret(value: string, visible = 4): string {
  if (!value) return ''
  if (value.length <= visible * 2) return '•'.repeat(value.length)
  return `${value.slice(0, visible)}${'•'.repeat(Math.min(24, value.length - visible * 2))}${value.slice(-visible)}`
}

export function loadVaultSecret(providerId: ProviderId): string {
  const vaultTypeId = getProvider(providerId).vaultTypeId
  if (!vaultTypeId) return ''
  return readApiTokenSecret(vaultTypeId)
}

export async function persistVaultSecret(
  providerId: ProviderId,
  authType: import('./types').AuthType,
  config: Record<string, string>,
): Promise<
  { ok: true; synced?: boolean; warning?: string } | { ok: false; error: string }
> {
  const vaultTypeId = getProvider(providerId).vaultTypeId
  if (!vaultTypeId) return { ok: true, synced: true }
  const key = primarySecretKey(providerId, authType)
  const value =
    config[key]?.trim() ||
    Object.entries(config)
      .filter(([k]) => !k.startsWith('_'))
      .map(([, v]) => v.trim())
      .find(Boolean) ||
    ''
  if (!value) return { ok: false, error: 'No secret value to store' }
  return writeApiTokenSecret(vaultTypeId, value)
}

export async function persistProviderVault(
  providerId: ProviderId,
  authType: AuthType,
  config: Record<string, string>,
  secrets: Record<string, string>,
  context?: { name?: string; notes?: string },
): Promise<
  { ok: true; synced?: boolean; warning?: string } | { ok: false; error: string }
> {
  const merged = { ...config, ...secrets }

  if (providerId === 'sentinel_hub') {
    const token = (merged.accessToken ?? '').trim()
    const instanceId = resolveSentinelHubInstanceId(merged, context?.name, context?.notes)
    if (!token) return { ok: false, error: 'OAuth access token is required' }
    if (!instanceId) {
      return { ok: false, error: 'WMS instance ID is required for Sentinel Hub layers' }
    }

    const tokenResult = await writeApiTokenSecret('sentinelHubAccessToken', token)
    if (!tokenResult.ok) {
      return { ok: false, error: 'error' in tokenResult ? tokenResult.error : 'Failed to store token' }
    }

    persistSentinelHubWmsInstanceIdInBrowser(instanceId)

    return {
      ok: true,
      synced: tokenResult.synced,
      warning: tokenResult.warning,
    }
  }

  return persistVaultSecret(providerId, authType, merged)
}

export async function testVaultConnection(
  providerId: ProviderId,
  authType: import('./types').AuthType,
  config: Record<string, string>,
  baseUrl: string,
): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const start = performance.now()
  const vaultTypeId = getProvider(providerId).vaultTypeId
  const key = primarySecretKey(providerId, authType)
  const inline = config[key]?.trim()

  if (providerId === 'sentinel_hub') {
    const token = (config.accessToken ?? inline ?? '').trim()
    const instanceId = resolveSentinelHubInstanceId(config)
    if (!token) {
      return { ok: false, message: 'OAuth access token is required', latencyMs: 0 }
    }
    if (!instanceId) {
      return { ok: false, message: 'WMS instance ID is required', latencyMs: 0 }
    }
    if (inline) await writeApiTokenSecret('sentinelHubAccessToken', token)
    persistSentinelHubWmsInstanceIdInBrowser(instanceId)
    const layers = await fetchSentinelHubWmsLayers()
    const latencyMs = Math.round(performance.now() - start)
    if (layers.length > 0) {
      return { ok: true, message: `Connected — ${layers.length} WMS layers`, latencyMs }
    }
    return {
      ok: false,
      message: 'Could not load WMS layers — check token and instance ID',
      latencyMs,
    }
  }

  if (vaultTypeId) {
    if (inline) {
      const write = await writeApiTokenSecret(vaultTypeId, inline)
      if (!write.ok) {
        return {
          ok: false,
          message: 'error' in write ? write.error : 'Failed to store secret',
          latencyMs: 0,
        }
      }
    }
    const tokenValue = inline || readApiTokenSecret(vaultTypeId)
    const test = await testApiTokenSecret(vaultTypeId, tokenValue)
    const latencyMs = Math.round(performance.now() - start)
    if (test === 'ok') return { ok: true, message: 'Connection successful', latencyMs }
    if (test === 'skipped') return { ok: true, message: 'Saved locally (live test skipped)', latencyMs }
    return { ok: false, message: 'Connection check failed', latencyMs }
  }

  if (!inline) {
    return { ok: false, message: 'Configure credentials before testing', latencyMs: 0 }
  }

  if (baseUrl.trim() && !/^https?:\/\//i.test(baseUrl)) {
    return { ok: false, message: 'Invalid base URL', latencyMs: 0 }
  }

  const latencyMs = Math.round(performance.now() - start)
  return { ok: true, message: 'Credentials saved locally (no remote probe for this provider)', latencyMs }
}

export function vaultTypeForProvider(providerId: ProviderId): ApiTokenTypeId | undefined {
  return getProvider(providerId).vaultTypeId
}

export function labelForVaultType(typeId: ApiTokenTypeId): string {
  return API_TOKEN_TYPE_BY_ID[typeId]?.label ?? typeId
}
