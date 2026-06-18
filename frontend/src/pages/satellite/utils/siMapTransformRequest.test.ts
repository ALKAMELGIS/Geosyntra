import { describe, expect, it, vi } from 'vitest'
import { createSiMapTransformRequest } from './siMapTransformRequest'

vi.mock('../../../lib/mapboxAccessToken', () => ({
  shouldProxyMapboxRequests: () => true,
}))

vi.mock('../../../lib/mapboxProxyUrl', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../lib/mapboxProxyUrl')>()
  return {
    ...actual,
    resolveMapboxProxyUrl: (url: string) => `/api/mapbox-proxy?url=${encodeURIComponent(url)}`,
  }
})

describe('createSiMapTransformRequest', () => {
  it('always returns a url object', () => {
    const tr = createSiMapTransformRequest(null)
    expect(tr('https://tile.openstreetmap.org/1/0/0.png', 'Tile')).toEqual({
      url: 'https://tile.openstreetmap.org/1/0/0.png',
    })
  })

  it('adds Sentinel auth headers for Sentinel Hub tiles', () => {
    const tr = createSiMapTransformRequest('sentinel-token')
    expect(
      tr('https://services.sentinel-hub.com/ogc/wms/abc?REQUEST=GetMap', 'Tile'),
    ).toEqual({
      url: 'https://services.sentinel-hub.com/ogc/wms/abc?REQUEST=GetMap',
      headers: { Authorization: 'Bearer sentinel-token' },
    })
  })

  it('proxies Mapbox vendor URLs through the API gateway', () => {
    const tr = createSiMapTransformRequest(null)
    const upstream = 'https://tiles.mapbox.com/v4/mapbox.satellite/2/1/2.png'
    expect(tr(upstream, 'Tile')).toEqual({
      url: `/api/mapbox-proxy?url=${encodeURIComponent(upstream)}`,
    })
  })
})
