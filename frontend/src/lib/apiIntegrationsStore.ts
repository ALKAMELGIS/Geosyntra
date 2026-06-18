import type { ApiIntegrationRecord, ApiTokenTypeId } from './apiIntegrationTypes'
import { scheduleApiVaultCatalogSync } from './apiVaultPersistence'

const STORAGE_KEY = 'geosyntra_api_integrations_v1'

function readAll(): ApiIntegrationRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecord)
  } catch {
    return []
  }
}

function isRecord(v: unknown): v is ApiIntegrationRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as ApiIntegrationRecord
  return typeof r.id === 'string' && typeof r.name === 'string' && typeof r.typeId === 'string'
}

function writeAll(rows: ApiIntegrationRecord[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  scheduleApiVaultCatalogSync()
}

export function listApiIntegrations(): ApiIntegrationRecord[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getApiIntegration(id: string): ApiIntegrationRecord | undefined {
  return readAll().find(r => r.id === id)
}

export function findIntegrationByType(typeId: ApiTokenTypeId): ApiIntegrationRecord | undefined {
  return readAll().find(r => r.typeId === typeId)
}

export type ApiIntegrationInput = {
  name: string
  typeId: ApiTokenTypeId
  provider: string
  baseUrl: string
  pollingMinutes: number
  active: boolean
  notes: string
}

export function createApiIntegration(input: ApiIntegrationInput): ApiIntegrationRecord {
  const now = new Date().toISOString()
  const row: ApiIntegrationRecord = {
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  const rows = readAll()
  rows.push(row)
  writeAll(rows)
  return row
}

export function updateApiIntegration(id: string, input: ApiIntegrationInput): ApiIntegrationRecord | null {
  const rows = readAll()
  const ix = rows.findIndex(r => r.id === id)
  if (ix < 0) return null
  const next: ApiIntegrationRecord = {
    ...rows[ix],
    ...input,
    updatedAt: new Date().toISOString(),
  }
  rows[ix] = next
  writeAll(rows)
  return next
}

export function deleteApiIntegration(id: string): void {
  writeAll(readAll().filter(r => r.id !== id))
}
