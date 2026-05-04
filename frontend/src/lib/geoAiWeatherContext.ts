/**
 * Shared weather facts for Geo AI (Gemini Geo Explorer + Claude/DeepSeek Geo AI Chat):
 * resolves coordinates from map anchor, layer names/attributes, or place geocode, then attaches **OpenWeather** when an API key is set (exclusive), otherwise **Open-Meteo**.
 */

import { geocodePlaceToLngLat, simplifyGeoExplorerUserQuery, stripLayerReferenceForGeocode } from './geoExplorerGeocode'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import { findLngLatFromLayerQuery, GEO_EXPLORER_MIN_LAYER_PIN_SCORE } from './geoExplorerLayerContext'
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

/** User named a specific calendar day — enable historical / per-day OpenWeather branches. */
function userRequestsExplicitCalendarDayForWeather(userText: string): boolean {
  const t = userText.trim()
  if (!t) return false
  return (
    /\b(today|tomorrow|yesterday|tonight|next\s+week|last\s+week|this\s+week)\b/i.test(t) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(t) ||
    /\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/.test(t) ||
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:\s*,?\s*\d{4})?\b/i.test(
      t,
    ) ||
    /\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(t)
  )
}

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
  /** Inspect card / feature card coords (Satellite Geo AI) or map popup click (GIS) — stabilizes “weather at same pin”. */
  inspectAnchorLngLat?: [number, number] | null
  combinedLayers: GeoAiMapLayer[]
  mapboxAccessToken?: string
  openWeatherApiKey: string
  mapPopup: GeoAiWeatherPopupRef
}): Promise<string> {
  const pinCoords =
    input.pinLngLat ?? input.lastMapQueryCoords ?? (input.inspectAnchorLngLat ?? null) ?? null
  const weatherImplied = geoExplorerUserMessageImpliesWeather(input.userText)

  let factsCoords: [number, number] | null = null
  if (weatherImplied) {
    const hit = findLngLatFromLayerQuery(input.userText, input.combinedLayers)
    if (hit && hit.score >= GEO_EXPLORER_MIN_LAYER_PIN_SCORE) {
      factsCoords = [hit.lng, hit.lat]
    } else if (pinCoords) {
      /** Map anchor / last MAP_QUERY / inspect card — avoids geocoding vague follow-ups (“same location”, “temp here”). */
      factsCoords = pinCoords
    } else {
      const gq = stripLayerReferenceForGeocode(simplifyGeoExplorerUserQuery(input.userText))
      if (gq.length >= 2) {
        const g = await geocodePlaceToLngLat(gq, { mapboxAccessToken: input.mapboxAccessToken })
        if (g) factsCoords = g
      }
    }
  }

  const ambientWeather =
    weatherImplied && Boolean(pinCoords) && !userRequestsExplicitCalendarDayForWeather(input.userText)

  const anchorCoords = pinCoords ?? (weatherImplied ? factsCoords : null)
  let out = ''

  if (anchorCoords) {
    const [aLng, aLat] = anchorCoords
    const popSnap = popupSnapForCoords(input.mapPopup, aLng, aLat)
    out += `\n\n${buildSessionAnchorBlock(aLng, aLat, popSnap)}`
  }

  if (weatherImplied && factsCoords) {
    const [fLng, fLat] = factsCoords
    const owm = input.openWeatherApiKey.trim()
    if (owm) {
      /* With a configured key, Geo AI weather answers use OpenWeather only (avoids mixing Open-Meteo “current” with a historical question). */
      out += `\n\n${await buildOpenWeatherContextBlock(owm, fLat, fLng, input.userText, {
        ambientWindowOnly: ambientWeather,
      })}`
    } else {
      out += `\n\n${await buildOpenMeteoContextBlock(fLat, fLng, input.userText)}`
    }
  }

  return out
}
