import { describe, expect, it } from 'vitest'
import { normalizePlaceNameForGeocode } from './geoExplorerGeocode'

describe('normalizePlaceNameForGeocode', () => {
  it('removes "in map" suffix', () => {
    expect(normalizePlaceNameForGeocode('Show me Dubai in map')).toBe('Dubai')
  })

  it('removes "on the map" suffix', () => {
    expect(normalizePlaceNameForGeocode('Show me Dubai on the map')).toBe('Dubai')
  })
})
