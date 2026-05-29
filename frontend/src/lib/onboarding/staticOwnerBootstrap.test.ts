import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../sha256Hex'
import { STATIC_OWNER_DEFAULT_PASSWORD_SHA256 } from './staticOwnerBootstrap'

describe('static owner bootstrap password', () => {
  it('matches sha256 of GeoSyntra-Admin-2026!', async () => {
    expect(await sha256Hex('GeoSyntra-Admin-2026!')).toBe(STATIC_OWNER_DEFAULT_PASSWORD_SHA256)
  })
})
