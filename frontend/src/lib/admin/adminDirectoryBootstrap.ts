import { mergeAdminUsersPreservingLocalSecrets } from '../adminDirectoryPersistence'
import { pullAdminDirectoryFromServer } from '../adminDirectoryPersistence'
import {
  buildAdminDirectorySnapshot,
  parseAdminDirectorySnapshot,
  readAuditLogRaw,
  writeAuditLogRaw,
  writeLocalAdminDirectoryBackup,
} from './adminDirectorySnapshot'
import { filterTombstonedEmails, mergeTombstonesFromServer } from './adminUserTombstones'
import { normalizeAdminUser } from './adminUserModel'

const ADMIN_USERS_KEY = 'adminUsers'

function readUsersRaw(): unknown[] {
  try {
    const raw = localStorage.getItem(ADMIN_USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUsersRaw(users: unknown[]): void {
  localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users))
}

function mergeAuditLogs(local: unknown[], remote: unknown[]): unknown[] {
  const byId = new Map<string, unknown>()
  for (const row of [...remote, ...local]) {
    if (!row || typeof row !== 'object') continue
    const id = String((row as { id?: unknown }).id ?? '').trim()
    if (!id) continue
    byId.set(id, row)
  }
  return [...byId.values()].sort((a, b) => {
    const atA = String((a as { at?: string }).at ?? '')
    const atB = String((b as { at?: string }).at ?? '')
    return new Date(atB).getTime() - new Date(atA).getTime()
  })
}

let inflightBootstrap: Promise<void> | null = null

/**
 * Pull durable directory from server without wiping local data when the server snapshot is empty.
 * Call when entering admin settings and before listing users.
 */
export function bootstrapAdminDirectory(): Promise<void> {
  if (inflightBootstrap) return inflightBootstrap
  inflightBootstrap = (async () => {
    const local = readUsersRaw()
    const localAudit = readAuditLogRaw()

    if (local.length > 0) {
      writeLocalAdminDirectoryBackup(buildAdminDirectorySnapshot(local, localAudit))
    }

    const remote = await pullAdminDirectoryFromServer()
    if (!remote) return

    if (remote.deletedEmails?.length) {
      mergeTombstonesFromServer(remote.deletedEmails)
    }

    if (remote.users.length === 0 && local.length > 0) {
      return
    }

    const mergedUsers = mergeAdminUsersPreservingLocalSecrets(local, remote.users)
    const withoutTombstones = filterTombstonedEmails(
      mergedUsers
        .map(normalizeAdminUser)
        .filter((u): u is NonNullable<ReturnType<typeof normalizeAdminUser>> => u != null),
    )
    writeUsersRaw(withoutTombstones)

    if (remote.auditLog.length > 0) {
      writeAuditLogRaw(mergeAuditLogs(localAudit, remote.auditLog).slice(0, 2000))
    }
  })().finally(() => {
    inflightBootstrap = null
  })
  return inflightBootstrap
}

export function applyAdminDirectorySnapshotImport(file: File): Promise<{ ok: boolean; message: string }> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseAdminDirectorySnapshot(JSON.parse(String(reader.result ?? '')))
        if (!parsed) {
          resolve({ ok: false, message: 'Invalid backup file format.' })
          return
        }
        const local = readUsersRaw()
        writeLocalAdminDirectoryBackup(buildAdminDirectorySnapshot(local, readAuditLogRaw()))
        writeUsersRaw(parsed.users)
        writeAuditLogRaw(parsed.auditLog)
        if (parsed.deletedEmails.length) mergeTombstonesFromServer(parsed.deletedEmails)
        resolve({
          ok: true,
          message: `Restored ${parsed.users.length} users from backup (${parsed.exportedAt.slice(0, 10)}).`,
        })
      } catch {
        resolve({ ok: false, message: 'Could not parse backup JSON.' })
      }
    }
    reader.onerror = () => resolve({ ok: false, message: 'Could not read backup file.' })
    reader.readAsText(file)
  })
}
