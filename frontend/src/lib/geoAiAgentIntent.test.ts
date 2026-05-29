import { describe, expect, it } from 'vitest'
import {
  detectGeoAiAgentIntent,
  extractMapPlaceText,
  isMapPlaceShowOrGeocodeQuery,
  resolveGeographicPlaceFromQuery,
} from './geoAiAgentIntent'
import { runGeoAiStatsCommand } from './geoAiStatsEngine'

describe('geoAiAgentIntent', () => {
  it('treats "Show me Dubai Location on map" as map place, not RS', () => {
    const q = 'Show me Dubai Location on map'
    expect(isMapPlaceShowOrGeocodeQuery(q)).toBe(true)
    expect(extractMapPlaceText(q)).toBe('Dubai')
    expect(detectGeoAiAgentIntent(q).type).toBe('map_place')
  })

  it('treats bare "Show me Dubai" as map place (no "on map" required)', () => {
    const q = 'Show me Dubai'
    expect(resolveGeographicPlaceFromQuery(q)).toBe('Dubai')
    expect(isMapPlaceShowOrGeocodeQuery(q)).toBe(true)
    expect(detectGeoAiAgentIntent(q).type).toBe('map_place')
  })

  it('strips trailing "in map" from place (Mapbox geocode)', () => {
    const q = 'Show me Dubai in map'
    expect(resolveGeographicPlaceFromQuery(q)).toBe('Dubai')
    expect(extractMapPlaceText(q)).toBe('Dubai')
  })

  it('does not treat RS overlay toggle as map place', () => {
    const q = 'Show NDVI imagery layer on map'
    expect(isMapPlaceShowOrGeocodeQuery(q)).toBe(false)
    expect(detectGeoAiAgentIntent(q).type).toBe('rs_toolbox')
  })

  it('treats "Zoom to Dubai Marina" as map place', () => {
    const q = 'Zoom to Dubai Marina'
    expect(resolveGeographicPlaceFromQuery(q)).toBe('Dubai Marina')
    expect(detectGeoAiAgentIntent(q).type).toBe('map_place')
  })

  it('treats "Show NDVI analysis" as RS toolbox', () => {
    expect(detectGeoAiAgentIntent('Show NDVI analysis').type).toBe('rs_toolbox')
  })

  it('treats hospital near-me search as places POI', () => {
    expect(detectGeoAiAgentIntent('Find hospitals near me').type).toBe('places_poi')
  })

  it('does not run tabular stats for "Show me Dubai" with no layers', () => {
    const stats = runGeoAiStatsCommand('Show me Dubai', [])
    expect(stats).toBeNull()
  })
})
