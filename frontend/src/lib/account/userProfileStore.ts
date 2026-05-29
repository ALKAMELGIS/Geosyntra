/**
 * Per-user profile extensions (browser-local, keyed by normalized email).
 * Ready to swap for API-backed profile service.
 */
import { normalizeEmail } from '../auth'

export const USER_PROFILE_EXTENDED_KEY = 'geosyntra_user_profile_extended_v1'
export const USER_PROFILE_CHANGE_EVENT = 'geosyntra-user-profile-change'

export type ProfileLoginSession = {
  id: string
  device: string
  location: string
  browser: string
  lastActive: string
  current?: boolean
}

export type ProfileActivityItem = {
  id: string
  type: 'login' | 'update' | 'upload' | 'security'
  title: string
  detail?: string
  at: string
}

export type UserProfileExtended = {
  phone?: string
  country?: string
  organization?: string
  twoFactorEnabled?: boolean
  notifyEmail?: boolean
  notifyProduct?: boolean
  notifySecurity?: boolean
  language?: string
  sessions?: ProfileLoginSession[]
  activity?: ProfileActivityItem[]
  updatedAt?: string
}

function readAll(): Record<string, UserProfileExtended> {
  try {
    const raw = localStorage.getItem(USER_PROFILE_EXTENDED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, UserProfileExtended>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, UserProfileExtended>): void {
  localStorage.setItem(USER_PROFILE_EXTENDED_KEY, JSON.stringify(all))
  window.dispatchEvent(new Event('storage'))
  window.dispatchEvent(new Event(USER_PROFILE_CHANGE_EVENT))
}

export function readUserProfileExtended(email: string): UserProfileExtended {
  const key = normalizeEmail(email)
  if (!key) return {}
  return readAll()[key] ?? {}
}

export function writeUserProfileExtended(
  email: string,
  patch: Partial<UserProfileExtended>,
): UserProfileExtended {
  const key = normalizeEmail(email)
  if (!key) return {}
  const all = readAll()
  const merged: UserProfileExtended = {
    ...(all[key] ?? {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  all[key] = merged
  writeAll(all)
  return merged
}

function defaultSessions(): ProfileLoginSession[] {
  const now = new Date()
  return [
    {
      id: 'sess-current',
      device: 'This device',
      location: 'Current session',
      browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser',
      lastActive: now.toISOString(),
      current: true,
    },
    {
      id: 'sess-mobile',
      device: 'Mobile',
      location: 'Dubai, AE',
      browser: 'Safari · iOS',
      lastActive: new Date(now.getTime() - 1000 * 60 * 60 * 26).toISOString(),
    },
    {
      id: 'sess-desktop',
      device: 'Desktop',
      location: 'Abu Dhabi, AE',
      browser: 'Edge · Windows',
      lastActive: new Date(now.getTime() - 1000 * 60 * 60 * 72).toISOString(),
    },
  ]
}

function defaultActivity(name: string): ProfileActivityItem[] {
  const now = Date.now()
  return [
    {
      id: 'act-1',
      type: 'login',
      title: 'Signed in',
      detail: 'Secure session started',
      at: new Date(now - 1000 * 60 * 12).toISOString(),
    },
    {
      id: 'act-2',
      type: 'update',
      title: 'Profile reviewed',
      detail: `${name} viewed account settings`,
      at: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
    },
    {
      id: 'act-3',
      type: 'upload',
      title: 'Avatar updated',
      detail: 'Profile photo saved locally',
      at: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
    },
    {
      id: 'act-4',
      type: 'security',
      title: 'Password unchanged',
      detail: 'No credential changes in the last 30 days',
      at: new Date(now - 1000 * 60 * 60 * 24 * 4).toISOString(),
    },
  ]
}

/** Ensures mock sessions/activity exist for demo until API is wired. */
export function ensureUserProfileDefaults(email: string, displayName: string): UserProfileExtended {
  const existing = readUserProfileExtended(email)
  if (existing.sessions?.length && existing.activity?.length) return existing
  return writeUserProfileExtended(email, {
    sessions: existing.sessions?.length ? existing.sessions : defaultSessions(),
    activity: existing.activity?.length ? existing.activity : defaultActivity(displayName),
    notifyEmail: existing.notifyEmail ?? true,
    notifyProduct: existing.notifyProduct ?? true,
    notifySecurity: existing.notifySecurity ?? true,
    twoFactorEnabled: existing.twoFactorEnabled ?? false,
    language: existing.language ?? 'en',
  })
}
