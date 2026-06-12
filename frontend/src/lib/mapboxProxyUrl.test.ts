import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveMapboxProxyUrl } from './mapboxProxyUrl'

vi.mock('./apiClient', async importOriginal => {
  const actual = await importOriginal<typeof import('./apiClient')>()
  return {
    ...actual,
    resolveApiUrl: (path: string) => path,
  }
})

describe('resolveMapboxProxyUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns an absolute URL for Mapbox GL workers (not a bare path)', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })

    const upstream =
      'https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/12/2489/1902.vector.pbf?access_token=pk.test'
    const proxied = resolveMapboxProxyUrl(upstream)

    expect(proxied.startsWith('http://localhost:5173/api/mapbox-proxy?url=')).toBe(true)
    expect(() => new Request(proxied)).not.toThrow()
  })
})
