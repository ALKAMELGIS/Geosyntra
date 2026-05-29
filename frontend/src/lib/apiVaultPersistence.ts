/**
 * Server-backed API vault: integration catalog + encrypted secrets survive code deploys.
 */

import type { ApiIntegrationRecord } from './apiIntegrationTypes'
import {
  applyPersistedApiSecretsToBrowser,
  getApiSecretsEndpoint,
  type ServerApiSecretsV3,
} from './apiSecretsServerPersistence'
import { authHeaders as workspaceAuthHeaders } from './apiClient'
import { readCurrentUser } from './auth'

const INTEGRATIONS_KEY = 'geosyntra_api_integrations_v1'
const META_KEY = 'geosyntra_api_integrations_meta_v2'

export type ApiVaultCatalog = {
  integrations: ApiIntegrationRecord[]
  meta: Record<string, unknown>
}

export type ApiVaultSnapshot = {
  catalog: ApiVaultCatalog
  secrets: ServerApiSecretsV3
  encrypted?: boolean
  updatedAt?: string | null
}

function vaultRequestHeaders(): HeadersInit {
  const raw = import.meta.env.VITE_AGRI_API_SECRETS_TOKEN
  const legacy = typeof raw === 'string' ? raw.trim() : ''
  const h: Record<string, string> = { ...(workspaceAuthHeaders() as Record<string, string>) }
  if (legacy) h['X-Agri-Api-Secrets-Token'] = legacy
  const me = readCurrentUser()
  if (me?.email) h['X-Agri-Vault-Actor'] = me.email
  return h
}

function vaultEndpoint(): string {
  const secretsUrl = getApiSecretsEndpoint()
  if (secretsUrl.includes('://')) {
    return secretsUrl.replace(/\/api-secrets\/?$/, '/api-vault')
  }
  return secretsUrl.replace(/\/api-secrets\/?$/, '/api-vault')
}

function readIntegrationsLocal(): ApiIntegrationRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(INTEGRATIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is ApiIntegrationRecord =>
        !!v && typeof v === 'object' && typeof (v as ApiIntegrationRecord).id === 'string',
    )
  } catch {
    return []
  }
}

function writeIntegrationsLocal(rows: ApiIntegrationRecord[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(rows))
}

function readMetaLocal(): Record<string, unknown> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(META_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeMetaLocal(meta: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(META_KEY, JSON.stringify(meta))
}

export function buildApiVaultCatalogSnapshot(): ApiVaultCatalog {
  return {
    integrations: readIntegrationsLocal(),
    meta: readMetaLocal(),
  }
}

export function applyApiVaultCatalogToBrowser(catalog: ApiVaultCatalog): void {
  const serverIntegrations = Array.isArray(catalog.integrations) ? catalog.integrations : []
  const local = readIntegrationsLocal()

  if (serverIntegrations.length > 0) {
    if (local.length === 0) {
      writeIntegrationsLocal(serverIntegrations)
    } else {
      const byId = new Map(local.map(r => [r.id, r]))
      for (const row of serverIntegrations) {
        byId.set(row.id, row)
      }
      writeIntegrationsLocal([...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    }
  }

  const serverMeta = catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}
  if (Object.keys(serverMeta).length > 0) {
    writeMetaLocal({ ...readMetaLocal(), ...serverMeta })
  }
}

let catalogSyncTimer: ReturnType<typeof window.setTimeout> | null = null

export function scheduleApiVaultCatalogSync(): void {
  if (typeof window === 'undefined') return
  if (catalogSyncTimer != null) window.clearTimeout(catalogSyncTimer)
  catalogSyncTimer = window.setTimeout(() => {
    catalogSyncTimer = null
    void persistApiVaultCatalogToServer()
  }, 400)
}

export async function persistApiVaultCatalogToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(vaultEndpoint(), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...vaultRequestHeaders() },
      body: JSON.stringify({ catalog: buildApiVaultCatalogSnapshot() }),
    })
    const data = (await res.json()) as { ok?: boolean; persisted?: boolean; error?: string }
    if (!res.ok || !data?.ok || !data.persisted) {
      return { ok: false, error: data?.error || res.statusText || 'Vault catalog sync failed' }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('geosyntra-api-vault-synced'))
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network'
    return { ok: false, error: msg }
  }
}

/** Integration catalog only (no secret values) — safe on every login. */
export async function hydrateApiVaultCatalogFromServer(): Promise<boolean> {
  try {
    const res = await fetch(vaultEndpoint(), {
      method: 'GET',
      credentials: 'include',
      headers: { ...vaultRequestHeaders() },
    })
    if (!res.ok) return false
    const data = (await res.json()) as {
      ok?: boolean
      persisted?: boolean
      catalog?: ApiVaultCatalog
    }
    if (data?.ok && data.persisted && data.catalog) {
      applyApiVaultCatalogToBrowser(data.catalog)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('geosyntra-api-vault-hydrated'))
      }
      return true
    }
  } catch {
    /* offline */
  }
  return false
}

export async function hydrateApiVaultFromServer(): Promise<boolean> {
  const { syncUserApiTokensForSession } = await import('./userTokenSessionSync')
  const session = await syncUserApiTokensForSession()
  if (session.ok && session.hydrated) return true

  const { clientApiSecretsHydrationEnabled } = await import('./systemTokensApi')
  if (!clientApiSecretsHydrationEnabled()) {
    await hydrateApiVaultCatalogFromServer()
    return false
  }
  let secretsOk = false
  try {
    const res = await fetch(vaultEndpoint(), {
      method: 'GET',
      credentials: 'include',
      headers: { ...vaultRequestHeaders() },
    })
    if (res.ok) {
      const data = (await res.json()) as {
        ok?: boolean
        persisted?: boolean
        catalog?: ApiVaultCatalog
        secrets?: ServerApiSecretsV3
      }
      if (data?.ok && data.persisted) {
        if (data.catalog) applyApiVaultCatalogToBrowser(data.catalog)
        if (data.secrets) {
          applyPersistedApiSecretsToBrowser(data.secrets)
          secretsOk = true
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('geosyntra-api-vault-hydrated'))
        }
        return secretsOk
      }
    }
  } catch {
    /* fall through to legacy secrets endpoint */
  }

  const { hydrateBrowserApiSecretsFromServer } = await import('./apiSecretsServerPersistence')
  secretsOk = await hydrateBrowserApiSecretsFromServer()
  if (!secretsOk) await hydrateApiVaultCatalogFromServer()
  return secretsOk
}

export async function probeApiVaultServer(): Promise<{
  reachable: boolean
  persisted: boolean
  encrypted: boolean
  authFailed?: boolean
}> {
  try {
    const res = await fetch(vaultEndpoint(), {
      method: 'GET',
      credentials: 'include',
      headers: { ...vaultRequestHeaders() },
    })
    let data: { ok?: boolean; persisted?: boolean; encrypted?: boolean } = {}
    try {
      data = (await res.json()) as typeof data
    } catch {
      // HTML 404 from static hosting is not a reachable vault API.
      return { reachable: false, persisted: false, encrypted: false }
    }
    if (!res.ok) {
      return {
        reachable: Boolean(data?.ok),
        persisted: false,
        encrypted: false,
        authFailed: res.status === 401 || res.status === 403,
      }
    }
    if (!data?.ok) {
      return { reachable: false, persisted: false, encrypted: false }
    }
    return {
      reachable: true,
      persisted: Boolean(data.persisted),
      encrypted: Boolean(data.encrypted),
    }
  } catch {
    return { reachable: false, persisted: false, encrypted: false }
  }
}
