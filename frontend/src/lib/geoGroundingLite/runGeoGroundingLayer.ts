import { buildGeoDatasetContextBlock } from './geoDatasetEngine'
import { GEO_EXPLOR_GROUNDING_RULES } from './geoExplorAgentRules'
import {
  fetchGeoGroundingStatus,
  groundingComputeRoute,
  groundingElevation,
  groundingGeocode,
  groundingPlacesSearch,
} from './groundingApiClient'
import { detectGeoGroundingIntent } from './intentDetector'
import { groundingSuggestionChipsFromMemory, readGeoSpatialMemory, writeGeoSpatialMemory } from './spatialMemory'
import type { GeoDatasetEngineInput, GeoGroundingPrefetchResult, GeoGroundingPlace } from './types'

export { GEO_EXPLOR_GROUNDING_RULES }

export async function runGeoGroundingLayer(
  engine: GeoDatasetEngineInput,
): Promise<GeoGroundingPrefetchResult> {
  const status = await fetchGeoGroundingStatus()
  const memory = readGeoSpatialMemory()
  const defaultChips = groundingSuggestionChipsFromMemory(memory)

  if (!status.configured) {
    return {
      configured: false,
      toolsUsed: [],
      contextBlock: '',
      suggestedChips: defaultChips,
      primaryCoords: engine.pinLngLat ?? null,
      places: [],
    }
  }

  const intent = detectGeoGroundingIntent(engine.userText)
  if (!intent.tools.length) {
    return {
      configured: true,
      toolsUsed: [],
      contextBlock: '',
      suggestedChips: defaultChips,
      primaryCoords: engine.pinLngLat ?? null,
      places: [],
    }
  }

  const toolsUsed: GeoGroundingPrefetchResult['toolsUsed'] = []
  let places: GeoGroundingPlace[] = []
  const geocodes: { label?: string; lat?: number; lng?: number }[] = []
  let route = null
  let elevations: { elevationMeters?: number; lat?: number; lng?: number }[] = []
  let primaryCoords: [number, number] | null = engine.pinLngLat ?? null

  const biasLat = engine.pinLngLat?.[1]
  const biasLng = engine.pinLngLat?.[0]

  if (intent.placesQuery && intent.tools.includes('places_text_search')) {
    toolsUsed.push('places_text_search')
    places = await groundingPlacesSearch({
      textQuery: intent.placesQuery,
      lat: biasLat,
      lng: biasLng,
    })
    const first = places.find(p => p.lat != null && p.lng != null)
    if (first) primaryCoords = [first.lng!, first.lat!]
  }

  if (intent.geocodeQuery && intent.tools.includes('geocode')) {
    toolsUsed.push('geocode')
    const results = await groundingGeocode(intent.geocodeQuery)
    geocodes.push(...results)
    const first = results.find(g => g.lat != null && g.lng != null)
    if (first) primaryCoords = [first.lng!, first.lat!]
  }

  if (intent.routeEndpoints && intent.tools.includes('compute_route')) {
    toolsUsed.push('compute_route')
    let dest = intent.routeEndpoints.destinationText
    let orig = intent.routeEndpoints.originText
    if (!orig && biasLat != null && biasLng != null) {
      orig = `${biasLat},${biasLng}`
    }
    const destGeo = await groundingGeocode(dest)
    const origGeo = orig ? await groundingGeocode(orig) : []
    const d = destGeo[0]
    const o = origGeo[0]
    if (d?.lat != null && d?.lng != null && o?.lat != null && o?.lng != null) {
      toolsUsed.push('geocode')
      const routeResp = await groundingComputeRoute({
        origin: { lat: o.lat, lng: o.lng },
        destination: { lat: d.lat, lng: d.lng },
      })
      route = routeResp?.route ?? null
      if (route) primaryCoords = [d.lng, d.lat]
    }
  }

  if (intent.wantsElevation && intent.tools.includes('elevation')) {
    toolsUsed.push('elevation')
    const loc =
      primaryCoords != null
        ? [{ lat: primaryCoords[1], lng: primaryCoords[0] }]
        : biasLat != null && biasLng != null
          ? [{ lat: biasLat, lng: biasLng }]
          : []
    if (loc.length) elevations = await groundingElevation(loc)
  }

  const contextBlock = buildGeoDatasetContextBlock({
    engine,
    places,
    geocodes,
    route,
    elevations,
    toolsUsed,
  })

  writeGeoSpatialMemory({
    lastPlaces: places,
    lastCoords: primaryCoords,
    lastQuery: engine.userText.slice(0, 200),
  })

  const chips = [...defaultChips]
  for (const p of places.slice(0, 2)) {
    if (p.name) chips.unshift(String(p.name).slice(0, 42))
  }

  return {
    configured: true,
    toolsUsed,
    contextBlock,
    suggestedChips: [...new Set(chips)].slice(0, 8),
    primaryCoords,
    places,
    routePolyline: route?.polyline,
  }
}
