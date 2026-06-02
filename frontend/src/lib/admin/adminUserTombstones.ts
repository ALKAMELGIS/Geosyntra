import { normalizeEmail } from '../auth'

const ADMIN_USERS_TOMBSTONES_KEY = 'adminUsersDeletedEmails'

function readTombstoneEmails(): Set<string> {
  try {
    const raw = localStorage.getItem(ADMIN_USERS_TOMBSTONES_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed
        .map(v => normalizeEmail(String(v ?? '')))
        .filter(Boolean),
    )
  } catch {
    return new Set()
  }
}

function writeTombstoneEmails(emails: Set<string>): void {
  localStorage.setItem(ADMIN_USERS_TOMBSTONES_KEY, JSON.stringify([...emails]))
}

export function tombstoneAdminUserEmail(email: string): void {
  const key = normalizeEmail(email)
  if (!key) return
  const set = readTombstoneEmails()
  set.add(key)
  writeTombstoneEmails(set)
}

export function isAdminUserEmailTombstoned(email: string): boolean {
  const key = normalizeEmail(email)
  if (!key) return false
  return readTombstoneEmails().has(key)
}

export function filterTombstonedEmails<T extends { email: string }>(rows: T[]): T[] {
  const tomb = readTombstoneEmails()
  if (tomb.size === 0) return rows
  return rows.filter(row => !tomb.has(normalizeEmail(row.email)))
}

export function readTombstoneEmailsList(): string[] {
  return [...readTombstoneEmails()]
}

/** Union server tombstones into local (never drops local tombstones on sync). */
export function mergeTombstonesFromServer(emails: string[]): void {
  const set = readTombstoneEmails()
  let changed = false
  for (const raw of emails) {
    const key = normalizeEmail(String(raw ?? ''))
    if (!key || set.has(key)) continue
    set.add(key)
    changed = true
  }
  if (changed) writeTombstoneEmails(set)
}
