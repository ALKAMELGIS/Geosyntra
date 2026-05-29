import { describe, expect, it } from 'vitest'
import {
  formatGeoAiVoiceGisIntentJson,
  geoAiPromptFromVoiceGisIntent,
  parseGeoAiVoiceGisIntent,
} from './geoAiVoiceGisIntent'

describe('parseGeoAiVoiceGisIntent', () => {
  it('detects route request', () => {
    const i = parseGeoAiVoiceGisIntent('um navigate from Dresden to Madrid please')
    expect(i.intent).toBe('ROUTE_REQUEST')
    expect(i.location).toContain('Dresden')
    expect(i.confidence).toBeGreaterThan(0.7)
  })

  it('detects POI search by default', () => {
    const i = parseGeoAiVoiceGisIntent('find hospitals near downtown')
    expect(i.intent).toBe('POI_SEARCH')
    expect(i.category).toBe('hospital')
  })

  it('formats JSON only object', () => {
    const i = parseGeoAiVoiceGisIntent('show NDVI layer')
    const json = formatGeoAiVoiceGisIntentJson(i)
    expect(JSON.parse(json).intent).toBe('LAYER_CONTROL')
  })

  it('builds agent prompt from intent', () => {
    const i = parseGeoAiVoiceGisIntent('route from Paris to Lyon')
    expect(geoAiPromptFromVoiceGisIntent(i)).toMatch(/Paris/)
  })
})
