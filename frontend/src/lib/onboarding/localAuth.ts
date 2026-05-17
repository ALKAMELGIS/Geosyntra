import { normalizeEmail, normalizeRole, startSession, type CurrentUser } from '../auth'
import { scheduleAdminDirectorySync } from '../adminDirectoryPersistence'
import {
  apiLogin,
  apiOAuthUpsert,
  apiRegister,
  type PublicAuthUser,
} from './authApi'

export type HomeAuthResult =
  | { ok: true; user: CurrentUser }
  | { ok: true; needsVerification: true; email: string; devVerificationLink?: string }
  | { ok: false; error: string; needsVerification?: boolean }

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

function syncPublicUserToAdminDirectory(user: PublicAuthUser, passwordHash?: string): void {
  const email = normalizeEmail(user.email)
  const users = readAdminUsers()
  const idx = users.findIndex(u => normalizeEmail(String(u.email ?? '')) === email)
  const row: Record<string, unknown> = {
    id: user.id,
    name: user.name,
    email,
    role: user.role || 'Viewer',
    status: 'Active',
    emailVerified: user.emailVerified,
    lastLogin: new Date().toISOString(),
    ...(passwordHash ? { passwordHash } : {}),
  }
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...row }
  } else {
    users.push(row)
  }
  writeAdminUsers(users)
}

function toCurrentUser(user: PublicAuthUser): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: normalizeEmail(user.email),
    role: normalizeRole(user.role),
  }
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

  const result = await apiRegister({ name, email, password })
  if (!result.ok) return result

  return {
    ok: true,
    needsVerification: true,
    email: result.email,
    devVerificationLink: result.devVerificationLink,
  }
}

export async function homeSignIn(input: {
  email: string
  password: string
}): Promise<HomeAuthResult> {
  const email = normalizeEmail(input.email)
  const password = input.password.trim()
  if (!email || !password) return { ok: false, error: 'Enter email and password.' }

  const result = await apiLogin({ email, password })
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      needsVerification: result.needsVerification,
    }
  }

  syncPublicUserToAdminDirectory(result.user)
  const user = toCurrentUser(result.user)
  startSession(user, { persist: true })
  return { ok: true, user }
}

export async function completeVerifiedSignIn(user: PublicAuthUser): Promise<HomeAuthResult> {
  syncPublicUserToAdminDirectory(user)
  const current = toCurrentUser(user)
  startSession(current, { persist: true })
  return { ok: true, user: current }
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

export type OAuthProvider = 'google' | 'apple' | 'github'

/** GitHub remains a local demo account; Google/Apple upsert on the API when configured. */
export async function homeOAuthSignIn(provider: OAuthProvider): Promise<HomeAuthResult> {
  if (provider === 'github') {
    return homeOAuthDemoSignIn(provider)
  }
  const label = provider === 'google' ? 'Google' : 'Apple'
  const email = `${provider}.user@geosyntra.demo`
  const result = await apiOAuthUpsert({
    email,
    name: `${label} User`,
    provider,
    sub: `demo-${provider}`,
  })
  if (!result.ok) {
    return homeOAuthDemoSignIn(provider)
  }
  syncPublicUserToAdminDirectory(result.user)
  const user = toCurrentUser(result.user)
  startSession(user, { persist: true })
  return { ok: true, user }
}

async function homeOAuthDemoSignIn(provider: OAuthProvider): Promise<HomeAuthResult> {
  const label = provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : 'GitHub'
  const email = `${provider}.user@geosyntra.demo`
  const users = readAdminUsers()
  let match = users.find(u => normalizeEmail(String(u.email ?? '')) === email)
  if (!match) {
    const id = Date.now()
    match = {
      id,
      name: `${label} User`,
      email,
      role: 'Viewer',
      status: 'Active',
      emailVerified: true,
      lastLogin: new Date().toISOString(),
      passwordHash: '',
      profileExtra: { firstName: label, lastName: 'User', oauthProvider: provider },
    }
    users.push(match)
    writeAdminUsers(users)
  } else {
    match.lastLogin = new Date().toISOString()
    writeAdminUsers(users)
  }
  const user: CurrentUser = {
    id: typeof match.id === 'number' ? match.id : Date.now(),
    name: String(match.name ?? `${label} User`),
    email,
    role: normalizeRole(match.role),
  }
  startSession(user, { persist: true })
  return { ok: true, user }
}
