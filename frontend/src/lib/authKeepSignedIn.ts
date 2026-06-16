const LS_KEEP_SIGNED_IN = 'geosyntra-keep-signed-in-v1'
const LS_SAVED_LOGIN = 'geosyntra-saved-login-v1'

export type SavedLoginCredentials = {
  email: string
  password: string
}

function encodeSecret(value: string): string {
  try {
    return btoa(unescape(encodeURIComponent(value)))
  } catch {
    return value
  }
}

function decodeSecret(encoded: string): string {
  try {
    return decodeURIComponent(escape(atob(encoded)))
  } catch {
    return encoded
  }
}

/** User preference: persist session across browser restarts (localStorage vs sessionStorage). */
export function readKeepSignedInPreference(): boolean {
  try {
    return localStorage.getItem(LS_KEEP_SIGNED_IN) === '1'
  } catch {
    return false
  }
}

export function clearSavedLoginCredentials(): void {
  try {
    localStorage.removeItem(LS_SAVED_LOGIN)
  } catch {
    /* ignore */
  }
}

/** Saved email / password for the sign-in form when "Keep me signed in" is enabled. */
export function readSavedLoginCredentials(): SavedLoginCredentials | null {
  if (!readKeepSignedInPreference()) return null
  try {
    const raw = localStorage.getItem(LS_SAVED_LOGIN)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { email?: string; password?: string }
    const email = String(parsed.email ?? '').trim()
    if (!email) return null
    const password = decodeSecret(String(parsed.password ?? ''))
    return { email, password }
  } catch {
    return null
  }
}

export function writeSavedLoginCredentials(email: string, password: string): void {
  try {
    const trimmedEmail = String(email || '').trim()
    if (!trimmedEmail) {
      clearSavedLoginCredentials()
      return
    }
    localStorage.setItem(
      LS_SAVED_LOGIN,
      JSON.stringify({
        email: trimmedEmail,
        password: encodeSecret(String(password ?? '')),
      }),
    )
  } catch {
    /* ignore */
  }
}

export function writeKeepSignedInPreference(keep: boolean): void {
  try {
    localStorage.setItem(LS_KEEP_SIGNED_IN, keep ? '1' : '0')
    if (!keep) clearSavedLoginCredentials()
  } catch {
    /* ignore */
  }
}

/** Persist session preference and optionally remember sign-in fields. */
export function syncSavedLoginCredentials(
  keep: boolean,
  email?: string,
  password?: string,
): void {
  writeKeepSignedInPreference(keep)
  if (!keep) return
  if (email != null && password != null) {
    writeSavedLoginCredentials(email, password)
  }
}
