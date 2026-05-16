import type { ApiIntegrationRecord } from '../../../lib/apiIntegrationTypes'
import {
  createApiIntegration,
  deleteApiIntegration,
  getApiIntegration,
  listApiIntegrations,
  updateApiIntegration,
} from '../../../lib/apiIntegrationsStore'
import type { ApiTokenTypeId } from '../../../lib/apiIntegrationTypes'
import { providerFromLegacyTypeId } from './providers/registry'
import type { AuthType, IntegrationDraft, IntegrationEnvironment, IntegrationRecord, IntegrationStatus, ProviderId } from './types'
import { applyActiveSentinelHubFromIntegrations } from '../../../lib/sentinelHubIntegrationSync'
import { getProvider } from './providers/registry'

const META_KEY = 'geosyntra_api_integrations_meta_v2'
const DRAFT_KEY = 'geosyntra_api_integration_draft'

export type IntegrationMeta = {
  providerId: ProviderId
  environment: IntegrationEnvironment
  integrationType: string
  authType: AuthType
  config: Record<string, string>
  dataMapping: Record<string, string>
  status: IntegrationStatus
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  latencyMs: number | null
}

function readMetaMap(): Record<string, IntegrationMeta> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(META_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, IntegrationMeta>
  } catch {
    return {}
  }
}

function writeMetaMap(map: Record<string, IntegrationMeta>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(META_KEY, JSON.stringify(map))
}

export function getIntegrationMeta(id: string): IntegrationMeta | undefined {
  return readMetaMap()[id]
}

export function setIntegrationMeta(id: string, meta: IntegrationMeta): void {
  const map = readMetaMap()
  map[id] = meta
  writeMetaMap(map)
}

export function removeIntegrationMeta(id: string): void {
  const map = readMetaMap()
  delete map[id]
  writeMetaMap(map)
}

export function toIntegrationRecord(row: ApiIntegrationRecord): IntegrationRecord {
  const meta = getIntegrationMeta(row.id)
  const providerId = meta?.providerId ?? providerFromLegacyTypeId(row.typeId)
  const provider = getProvider(providerId)
  return {
    id: row.id,
    name: row.name,
    providerId,
    environment: meta?.environment ?? 'production',
    integrationType: meta?.integrationType ?? provider.label,
    authType: meta?.authType ?? provider.defaultAuthType,
    provider: row.provider,
    baseUrl: row.baseUrl || provider.defaultBaseUrl || '',
    pollingMinutes: row.pollingMinutes,
    active: row.active,
    notes: row.notes,
    config: meta?.config ?? {},
    dataMapping: meta?.dataMapping ?? {},
    status: meta?.status ?? 'pending',
    lastCheckedAt: meta?.lastCheckedAt ?? null,
    lastSuccessAt: meta?.lastSuccessAt ?? null,
    latencyMs: meta?.latencyMs ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listIntegrationRecords(): IntegrationRecord[] {
  return listApiIntegrations().map(toIntegrationRecord)
}

export function getIntegrationRecord(id: string): IntegrationRecord | undefined {
  const row = getApiIntegration(id)
  return row ? toIntegrationRecord(row) : undefined
}

export function saveIntegrationRecord(
  draft: IntegrationDraft,
  secrets: Record<string, string>,
): IntegrationRecord {
  const config = { ...draft.config, ...secrets }
  const typeId = (getProvider(draft.providerId).vaultTypeId ?? 'mapboxToken') as ApiTokenTypeId
  const input = {
    name: draft.name,
    typeId,
    provider: draft.provider || getProvider(draft.providerId).label,
    baseUrl: draft.baseUrl,
    pollingMinutes: draft.pollingMinutes,
    active: draft.active,
    notes: draft.notes,
  }

  const row = draft.id
    ? updateApiIntegration(draft.id, input)
    : createApiIntegration(input)

  if (!row) throw new Error('Failed to save integration')

  const meta: IntegrationMeta = {
    providerId: draft.providerId,
    environment: draft.environment,
    integrationType: draft.integrationType,
    authType: draft.authType,
    config: stripSecretsFromConfig(config, draft.providerId, draft.authType),
    dataMapping: draft.dataMapping,
    status: draft.status,
    lastCheckedAt: draft.lastCheckedAt,
    lastSuccessAt: draft.lastSuccessAt,
    latencyMs: draft.latencyMs,
  }
  setIntegrationMeta(row.id, meta)
  if (draft.providerId === 'sentinel_hub' && draft.active) {
    applyActiveSentinelHubFromIntegrations()
  }
  return toIntegrationRecord(row)
}

function stripSecretsFromConfig(
  config: Record<string, string>,
  providerId: ProviderId,
  authType: AuthType,
): Record<string, string> {
  const fields = getProvider(providerId).fieldsByAuth[authType] ?? []
  const out = { ...config }
  for (const f of fields) {
    if (f.secret && out[f.id]) out[f.id] = '__vault__'
  }
  return out
}

export function deleteIntegrationRecord(id: string): void {
  deleteApiIntegration(id)
  removeIntegrationMeta(id)
}

export function saveDraft(draft: IntegrationDraft): void {
  if (typeof window === 'undefined') return
  const safe = { ...draft, config: Object.fromEntries(Object.entries(draft.config).map(([k, v]) => [k, v ? '__redacted__' : ''])) }
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(safe))
}

export function loadDraft(): IntegrationDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as IntegrationDraft
  } catch {
    return null
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DRAFT_KEY)
}

export function emptyDraft(providerId: ProviderId = 'mapbox'): IntegrationDraft {
  const p = getProvider(providerId)
  return {
    name: '',
    providerId,
    environment: 'production',
    integrationType: p.label,
    authType: p.defaultAuthType,
    provider: p.label,
    baseUrl: p.defaultBaseUrl ?? '',
    pollingMinutes: 60,
    active: true,
    notes: '',
    config: {},
    dataMapping: {},
    status: 'pending',
    lastCheckedAt: null,
    lastSuccessAt: null,
    latencyMs: null,
  }
}
