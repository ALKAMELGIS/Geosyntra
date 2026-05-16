/**
 * Applies active Sentinel Hub API Manager integration credentials to browser storage
 * (WMS instance UUID + OAuth token) so Satellite Intelligence can load layers.
 */
import { listIntegrationRecords } from '../pages/settings/apiIntegration/integrationStore'
import { loadVaultSecret } from '../pages/settings/apiIntegration/vaultBridge'
import { persistSentinelHubAccessTokenInBrowser } from './sentinelHubAccessToken'
import {
  getSentinelHubWmsInstanceIdBrowserOverride,
  persistSentinelHubWmsInstanceIdInBrowser,
} from './sentinelHubWmsInstance'

export { SENTINEL_HUB_PUBLIC_DATA_INSTANCE_ID } from './sentinelHubWmsInstance'

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i

export function extractUuid(text: string): string | null {
  const m = text.trim().match(UUID_RE)
  return m ? m[0].toLowerCase() : null
}

export function resolveSentinelHubInstanceId(
  config: Record<string, string>,
  name = '',
  notes = '',
): string {
  const fromConfig = (config.instanceId ?? '').trim()
  if (fromConfig) return fromConfig
  return extractUuid(name) || extractUuid(notes) || ''
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

  const records = listIntegrationRecords()
    .filter(r => r.active && r.providerId === 'sentinel_hub')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  for (const record of records) {
    const instanceId = resolveSentinelHubInstanceId(record.config, record.name, record.notes)
    if (!instanceId) continue

    persistSentinelHubWmsInstanceIdInBrowser(instanceId)

    const token = loadVaultSecret('sentinel_hub').trim()
    if (token) persistSentinelHubAccessTokenInBrowser(token)

    return { applied: true, instanceId, tokenApplied: Boolean(token) }
  }

  const existing = getSentinelHubWmsInstanceIdBrowserOverride()
  if (existing) return { applied: false, instanceId: existing, tokenApplied: false }

  return empty
}
