import { describe, expect, it } from 'vitest'
import { buildBasemapCatalog } from './basemapCatalog'

describe('buildBasemapCatalog', () => {
  it('keeps Mapbox raster satellite/hybrid when vector styles are disabled', () => {
    const catalog = buildBasemapCatalog('', { includeMapboxVectorBasemaps: false })
    const ids = catalog.map(e => e.id)
    expect(ids).toContain('mapbox-standard-satellite')
    expect(ids).toContain('mapbox-hybrid')
    expect(ids).not.toContain('mb-streets')
  })

  it('includes Mapbox vector basemaps when enabled and token is set', () => {
    const catalog = buildBasemapCatalog('pk.test.token', { includeMapboxVectorBasemaps: true })
    expect(catalog.some(e => e.id === 'mb-streets')).toBe(true)
  })
})
