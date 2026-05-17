import { normalizeEmail, normalizeRole, startSession, type CurrentUser } from '../auth'
import { scheduleAdminDirectorySync } from '../adminDirectoryPersistence'

export type HomeAuthResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string }

async function sha256Hex(value: string): Promise<string> {
  const enc = new TextEncoder().encode(value)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function readAdminUsers(): Array<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem('adminUsers')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAdminUsers(users: Array<Record<string, unknown>>): void {
  localStorage.setItem('adminUsers', JSON.stringify(users))
  scheduleAdminDirectorySync()
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export async function homeSignUp(input: {
  name: string
  email: string
  password: string
}): Promise<HomeAuthResult> {
  const email = normalizeEmail(input.email)
  const password = input.password.trim()
  const name = input.name.trim()
  if (!email || !password || password.length < 6) {
    return { ok: false, error: 'Enter a valid email and password (min 6 characters).' }
  }
  if (!name) return { ok: false, error: 'Enter your full name.' }

  const users = readAdminUsers()
  if (users.some(u => normalizeEmail(String(u.email ?? '')) === email)) {
    return { ok: false, error: 'An account with this email already exists. Sign in instead.' }
  }

  const passwordHash = await sha256Hex(password)
  const { firstName, lastName } = splitName(name)
  const id = Date.now()
  users.push({
    id,
    name,
    email,
    role: 'Viewer',
    status: 'Active',
    emailVerified: true,
    lastLogin: 'Never',
    passwordHash,
    profileExtra: { firstName, lastName },
  })
  writeAdminUsers(users)

  const user: CurrentUser = { id, name, email, role: 'Viewer' }
  startSession(user, { persist: true })
  return { ok: true, user }
}

export async function homeSignIn(input: {
  email: string
  password: string
}): Promise<HomeAuthResult> {
  const email = normalizeEmail(input.email)
  const password = input.password.trim()
  if (!email || !password) return { ok: false, error: 'Enter email and password.' }

  const passwordHash = await sha256Hex(password)
  const users = readAdminUsers()
  const match = users.find(u => normalizeEmail(String(u.email ?? '')) === email)
  if (!match) return { ok: false, error: 'No account found for this email.' }

  const storedHash = String(match.passwordHash ?? '').trim()
  if (!storedHash || storedHash !== passwordHash) {
    return { ok: false, error: 'Incorrect password.' }
  }

  const user: CurrentUser = {
    id: typeof match.id === 'number' ? match.id : Date.now(),
    name: String(match.name ?? email),
    email,
    role: normalizeRole(match.role),
  }
  startSession(user, { persist: true })
  match.lastLogin = new Date().toISOString()
  writeAdminUsers(users)
  return { ok: true, user }
}

export function displayFirstName(user: CurrentUser | null): string {
  if (!user) return ''
  const parts = user.name.trim().split(/\s+/)
  return parts[0] || user.email.split('@')[0] || 'there'
}

/** Header greeting — e.g. "MOHAMED" for nav status bar. */
export function displayHeaderName(user: CurrentUser | null): string {
  const first = displayFirstName(user)
  return first ? first.toLocaleUpperCase('en-US') : ''
}
