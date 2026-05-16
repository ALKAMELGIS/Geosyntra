/**
 * Applies active Sentinel Hub API Manager integration credentials to browser storage
 * (WMS instance UUID + OAuth token) so Satellite Intelligence can load layers.
 */
import { listApiIntegrations } from './apiIntegrationsStore'
import { readApiTokenSecret } from './apiIntegrationTokens'
import { providerFromLegacyTypeId } from '../pages/settings/apiIntegration/providers/registry'
import type { ProviderId } from '../pages/settings/apiIntegration/types'
import { persistSentinelHubAccessTokenInBrowser } from './sentinelHubAccessToken'
import {
  getSentinelHubWmsInstanceIdBrowserOverride,
  persistSentinelHubWmsInstanceIdInBrowser,
} from './sentinelHubWmsInstance'
import { resolveSentinelHubInstanceId } from './sentinelHubResolve'

export { SENTINEL_HUB_PUBLIC_DATA_INSTANCE_ID } from './sentinelHubWmsInstance'
export { extractUuid, resolveSentinelHubInstanceId } from './sentinelHubResolve'

const INTEGRATION_META_KEY = 'geosyntra_api_integrations_meta_v2'

type IntegrationMetaLite = {
  providerId?: ProviderId
  config?: Record<string, string>
}

function readIntegrationMetaMap(): Record<string, IntegrationMetaLite> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(INTEGRATION_META_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, IntegrationMetaLite>
  } catch {
    return {}
  }
}

export type ApplySentinelHubResult = {
  applied: boolean
  instanceId: string
  tokenApplied: boolean
}

/** Push the newest active Sentinel Hub integration into localStorage overrides. */
export function applyActiveSentinelHubFromIntegrations(): ApplySentinelHubResult {
  const empty: ApplySentinelHubResult = { applied: false, instanceId: '', tokenApplied: false }
  if (typeof window === 'undefined') return empty

  const meta = readIntegrationMetaMap()
  const records = listApiIntegrations()
    .map(row => {
      const m = meta[row.id]
      const providerId = (m?.providerId ?? providerFromLegacyTypeId(row.typeId)) as ProviderId
      return {
        active: row.active,
        providerId,
        config: m?.config ?? {},
        name: row.name,
        notes: row.notes ?? '',
        updatedAt: row.updatedAt,
      }
    })
    .filter(r => r.active && r.providerId === 'sentinel_hub')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  for (const record of records) {
    const instanceId = resolveSentinelHubInstanceId(record.config, record.name, record.notes)
    if (!instanceId) continue

    persistSentinelHubWmsInstanceIdInBrowser(instanceId)

    const token = readApiTokenSecret('sentinelHubAccessToken').trim()
    if (token) persistSentinelHubAccessTokenInBrowser(token)

    return { applied: true, instanceId, tokenApplied: Boolean(token) }
  }

  const existing = getSentinelHubWmsInstanceIdBrowserOverride()
  if (existing) return { applied: false, instanceId: existing, tokenApplied: false }

  return empty
}
