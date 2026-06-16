import { afterEach, describe, expect, it } from 'vitest'
import {
  clearSavedLoginCredentials,
  readKeepSignedInPreference,
  readSavedLoginCredentials,
  syncSavedLoginCredentials,
  writeKeepSignedInPreference,
} from './authKeepSignedIn'

afterEach(() => {
  localStorage.clear()
})

describe('authKeepSignedIn', () => {
  it('saves and restores email/password when keep signed in is enabled', () => {
    syncSavedLoginCredentials(true, 'user@example.com', 'secret-pass')
    expect(readKeepSignedInPreference()).toBe(true)
    expect(readSavedLoginCredentials()).toEqual({
      email: 'user@example.com',
      password: 'secret-pass',
    })
  })

  it('clears saved credentials when keep signed in is disabled', () => {
    syncSavedLoginCredentials(true, 'user@example.com', 'secret-pass')
    writeKeepSignedInPreference(false)
    expect(readKeepSignedInPreference()).toBe(false)
    expect(readSavedLoginCredentials()).toBeNull()
  })

  it('does not return credentials when preference is off', () => {
    syncSavedLoginCredentials(true, 'user@example.com', 'secret-pass')
    localStorage.setItem('geosyntra-keep-signed-in-v1', '0')
    expect(readSavedLoginCredentials()).toBeNull()
  })

  it('clearSavedLoginCredentials removes stored login only', () => {
    syncSavedLoginCredentials(true, 'user@example.com', 'secret-pass')
    clearSavedLoginCredentials()
    expect(readSavedLoginCredentials()).toBeNull()
    expect(readKeepSignedInPreference()).toBe(true)
  })
})
