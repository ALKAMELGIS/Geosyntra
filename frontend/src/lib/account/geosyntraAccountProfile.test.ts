import { describe, expect, it } from 'vitest'
import { accountProfileInitials } from './geosyntraAccountProfile'

describe('accountProfileInitials', () => {
  it('uses two letters for multi-word names', () => {
    expect(accountProfileInitials('Alkamel User')).toBe('AU')
  })

  it('uses first two chars for single token', () => {
    expect(accountProfileInitials('Alkamel')).toBe('AL')
  })
})
