import { AUDIT_LOG_STORAGE_KEY } from '../auditConstants'
import { readTombstoneEmailsList } from './adminUserTombstones'

/** Versioned SaaS directory export — survives app updates when restored from file or server. */
export const ADMIN_DIRECTORY_SCHEMA_VERSION = 2

export type AdminDirectorySnapshot = {
  schemaVersion: number
  exportedAt: string
  users: unknown[]
  auditLog: unknown[]
  deletedEmails: string[]
}

const LOCAL_BACKUP_KEY = 'adminDirectorySnapshotBackup'

export function buildAdminDirectorySnapshot(users: unknown[], auditLog: unknown[]): AdminDirectorySnapshot {
  return {
    schemaVersion: ADMIN_DIRECTORY_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    users: Array.isArray(users) ? users : [],
    auditLog: Array.isArray(auditLog) ? auditLog : [],
    deletedEmails: readTombstoneEmailsList(),
  }
}

export function parseAdminDirectorySnapshot(raw: unknown): AdminDirectorySnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const users = Array.isArray(o.users) ? o.users : []
  const auditLog = Array.isArray(o.auditLog) ? o.auditLog : []
  const deletedEmails = Array.isArray(o.deletedEmails)
    ? o.deletedEmails.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean)
    : []
  return {
    schemaVersion: Number(o.schemaVersion) || 1,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date().toISOString(),
    users,
    auditLog,
    deletedEmails,
  }
}

export function writeLocalAdminDirectoryBackup(snapshot: AdminDirectorySnapshot): void {
  try {
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(snapshot))
  } catch {
    /* quota */
  }
}

export function readLocalAdminDirectoryBackup(): AdminDirectorySnapshot | null {
  try {
    const raw = localStorage.getItem(LOCAL_BACKUP_KEY)
    if (!raw) return null
    return parseAdminDirectorySnapshot(JSON.parse(raw))
  } catch {
    return null
  }
}

export function downloadAdminDirectorySnapshot(snapshot: AdminDirectorySnapshot, filename?: string): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `geosyntra-admin-directory-${snapshot.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function readAuditLogRaw(): unknown[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeAuditLogRaw(auditLog: unknown[]): void {
  try {
    localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(auditLog.slice(0, 2000)))
  } catch {
    /* ignore */
  }
}
