import { describe, expect, it } from 'vitest'
import { isSubtleCryptoAvailable, sha256Hex } from './sha256Hex'

describe('sha256Hex', () => {
  it('matches known SHA-256 of GeoSyntra-Admin-2026!', async () => {
    const expected = '2e8f0c1fe3c4eb4bbf56bbcd70b65aec40bc4c2992f4071bab53514ce6252d69'
    expect(await sha256Hex('GeoSyntra-Admin-2026!')).toBe(expected)
  })

  it('js fallback matches subtle when both are available', async () => {
    if (!isSubtleCryptoAvailable()) return
    const sample = 'cross-check-fallback'
    const subtle = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sample))
    const subtleHex = Array.from(new Uint8Array(subtle), b => b.toString(16).padStart(2, '0')).join('')
    expect(await sha256Hex(sample)).toBe(subtleHex)
  })
})
