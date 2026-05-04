/**
 * Shared weather facts for Geo AI (Gemini Geo Explorer + Claude/DeepSeek Geo AI Chat):
 * resolves coordinates from map anchor, layer names/attributes, or place geocode, then attaches Open-Meteo (+ optional OpenWeather).
 */

import { geocodePlaceToLngLat, simplifyGeoExplorerUserQuery, stripLayerReferenceForGeocode } from './geoExplorerGeocode'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import { findLngLatFromLayerQuery } from './geoExplorerLayerContext'
import {
  buildOpenMeteoContextBlock,
  buildSessionAnchorBlock,
  geoExplorerUserMessageImpliesWeather,
  type SessionAnchorPopup,
} from './openMeteoGeoExplorer'
import { buildOpenWeatherContextBlock } from './openWeatherGeoExplorer'

export type GeoAiWeatherPopupRef = {
  lng: number
  lat: number
  placeName: string
  country: string
  fullDescription: string
} | null

function popupSnapForCoords(popup: GeoAiWeatherPopupRef, lng: number, lat: number): SessionAnchorPopup {
  if (!popup) return null
  if (Math.abs(popup.lng - lng) < 1e-5 && Math.abs(popup.lat - lat) < 1e-5) {
    return {
      placeName: popup.placeName,
      country: popup.country,
      fullDescription: popup.fullDescription,
    }
  }
  return null
}

/**
 * Returns extra system text: SESSION MAP ANCHOR (when coordinates are known) and, if the user asked about weather,
 * Open-Meteo facts and optionally OpenWeather facts.
 */
export async function buildGeoAiWeatherSystemAppend(input: {
  userText: string
  pinLngLat: [number, number] | null
  lastMapQueryCoords: [number, number] | null
  combinedLayers: GeoAiMapLayer[]
  mapboxAccessToken?: string
  openWeatherApiKey: string
  mapPopup: GeoAiWeatherPopupRef
}): Promise<string> {
  const pinCoords = input.pinLngLat ?? input.lastMapQueryCoords
  const weatherImplied = geoExplorerUserMessageImpliesWeather(input.userText)

  let factsCoords: [number, number] | null = null
  if (weatherImplied) {
    const hit = findLngLatFromLayerQuery(input.userText, input.combinedLayers)
    if (hit) {
      factsCoords = [hit.lng, hit.lat]
    } else if (pinCoords) {
      /** Map anchor / last MAP_QUERY — avoids geocoding vague follow-ups (“same location”, “temp here”) to a wrong place. */
      factsCoords = pinCoords
    } else {
      const gq = stripLayerReferenceForGeocode(simplifyGeoExplorerUserQuery(input.userText))
      if (gq.length >= 2) {
        const g = await geocodePlaceToLngLat(gq, { mapboxAccessToken: input.mapboxAccessToken })
        if (g) factsCoords = g
      }
    }
  }

  const anchorCoords = pinCoords ?? (weatherImplied ? factsCoords : null)
  let out = ''

  if (anchorCoords) {
    const [aLng, aLat] = anchorCoords
    const popSnap = popupSnapForCoords(input.mapPopup, aLng, aLat)
    out += `\n\n${buildSessionAnchorBlock(aLng, aLat, popSnap)}`
  }

  if (weatherImplied && factsCoords) {
    const [fLng, fLat] = factsCoords
    out += `\n\n${await buildOpenMeteoContextBlock(fLat, fLng, input.userText)}`
    const owm = input.openWeatherApiKey.trim()
    if (owm) {
      out += `\n\n${await buildOpenWeatherContextBlock(owm, fLat, fLng)}`
    }
  }

  return out
}
