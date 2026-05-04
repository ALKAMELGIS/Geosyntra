/**
 * Geo AI weather location resolution (three scenarios: map anchor, GIS/inspect feature, text geocode)
 * plus compact Open-Meteo fetch for dual-provider context alongside OpenWeatherMap.
 */

import { geocodePlaceToLngLat, simplifyGeoExplorerUserQuery, stripLayerReferenceForGeocode } from './geoExplorerGeocode'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import {
  findLngLatFromLayerQuery,
  GEO_EXPLORER_MIN_LAYER_PIN_SCORE,
  type LayerQueryMatch,
} from './geoExplorerLayerContext'
import { geoExplorerUserMessageImpliesWeather } from './openMeteoGeoExplorer'

export type WeatherFactsCoordSource = 'map_anchor' | 'inspect_selection' | 'layer_feature' | 'geocode'

export type WeatherFactsCoordResolution = {
  lng: number
  lat: number
  source: WeatherFactsCoordSource
  placeLabel?: string
  layerHit: LayerQueryMatch | null
}

const MAP_ANCHOR_WEATHER_RE =
  /\b(here|this\s+location|this\s+spot|current\s+(?:map\s+)?(?:view|center)|same\s+place|same\s+spot|at\s+the\s+pin|where\s+i\s+(?:clicked|am)|on\s+the\s+map|map\s+center)\b/i

const INSPECT_FEATURE_WEATHER_RE =
  /\b(this\s+farm|this\s+feature|this\s+parcel|this\s+polygon|the\s+highlighted|selected\s+feature|selected\s+farm)\b/i

/** English / Arabic phrasing that ties weather to the map focus (scenario 2). */
export function weatherQueryPrefersMapAnchor(userText: string): boolean {
  const t = userText.trim()
  if (!t) return false
  if (MAP_ANCHOR_WEATHER_RE.test(t)) return true
  return /(?:^|\s)(هنا|هذا الموقع|نفس المكان|مركز الخريطة|موقع الخريطة|في الخريطة|الطقس هنا)(?:\s|$)/u.test(t)
}

/** Popup / inspect card selection (scenario 3 — explicit feature/farm wording). */
export function weatherQueryPrefersInspectSelection(userText: string): boolean {
  const t = userText.trim()
  if (!t) return false
  if (INSPECT_FEATURE_WEATHER_RE.test(t)) return true
  return /(?:هذه المزرعة|المزرعة المحددة|المحدد|الكيان المحدد|طبقة محددة)/u.test(t)
}

/** Strip boilerplate so geocoders receive a place name (scenario 1). */
export function extractPlaceQueryForWeatherGeocode(userText: string): string {
  let s = simplifyGeoExplorerUserQuery(userText)
  s = stripLayerReferenceForGeocode(s)
  s = s
    .replace(/^(?:what(?:'s| is)|how(?:'s| is)|tell me|give me|show(?: me)?|شو|ما هو|ما هي|اعرض|أخبرني)\s+/gi, '')
    .replace(/\b(?:the\s+)?(?:weather|climate|forecast|temperature|temp|طقس|مناخ|حرارة)\b/gi, ' ')
    .replace(/\b(?:please|thanks)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  const inMatch = s.match(/\b(?:in|at|for|near|في|عند)\s+(.+)/i)
  if (inMatch && inMatch[1]?.trim().length >= 2) {
    return inMatch[1].trim().slice(0, 220)
  }
  return s.slice(0, 220)
}

export async function openMeteoForwardGeocode(
  placeQuery: string,
): Promise<{ lng: number; lat: number; name: string } | null> {
  const q = simplifyGeoExplorerUserQuery(placeQuery).trim()
  if (q.length < 2 || q.length > 200) return null
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { results?: Array<{ latitude: number; longitude: number; name: string }> }
    const r = data.results?.[0]
    if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null
    return { lng: r.longitude, lat: r.latitude, name: r.name || q }
  } catch {
    return null
  }
}

export async function fetchOpenMeteoCurrentSnapshot(
  lat: number,
  lng: number,
): Promise<{ temp: number | null; humidity: number | null; windKmh: number | null } | null> {
  try {
    const u = new URL('https://api.open-meteo.com/v1/forecast')
    u.searchParams.set('latitude', String(lat))
    u.searchParams.set('longitude', String(lng))
    u.searchParams.set('current', 'temperature_2m,relative_humidity_2m,windspeed_10m')
    u.searchParams.set('timezone', 'auto')
    const res = await fetch(u.toString())
    if (!res.ok) return null
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; relative_humidity_2m?: number; windspeed_10m?: number }
    }
    const c = data.current
    if (!c || typeof c !== 'object') return null
    return {
      temp: typeof c.temperature_2m === 'number' ? c.temperature_2m : null,
      humidity: typeof c.relative_humidity_2m === 'number' ? c.relative_humidity_2m : null,
      windKmh: typeof c.windspeed_10m === 'number' ? c.windspeed_10m : null,
    }
  } catch {
    return null
  }
}

function extractNdviFromProps(p: Record<string, unknown>): number | null {
  for (const [k, v] of Object.entries(p)) {
    if (!/ndvi/i.test(k)) continue
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Short GIS-aware hints for the model (not a substitute for remote sensing QA). */
export function buildAgriWeatherInsightAppend(
  layerHit: LayerQueryMatch | null | undefined,
  snap: { temp: number | null; windKmh: number | null } | null,
): string {
  const hints: string[] = []
  const p = layerHit?.properties
  if (p && typeof p === 'object') {
    const ndvi = extractNdviFromProps(p as Record<string, unknown>)
    const temp = snap?.temp
    const wind = snap?.windKmh
    if (ndvi != null && ndvi < 0.3 && temp != null && temp > 35) {
      hints.push(
        `- Low NDVI (~${ndvi.toFixed(2)}) with high temperature (~${temp.toFixed(1)}°C) may indicate vegetation stress; combine with irrigation/soil data.`,
      )
    } else if (ndvi != null && ndvi < 0.3) {
      hints.push(`- NDVI is relatively low (~${ndvi.toFixed(2)}); interpret together with phenology and crop type.`)
    }
    if (wind != null && wind > 30) {
      hints.push(`- Open-Meteo snapshot reports strong wind (~${wind.toFixed(0)} km/h); relevant for spraying / drying.`)
    }
  } else if (snap?.windKmh != null && snap.windKmh > 30) {
    hints.push(`- Strong wind snapshot (~${snap.windKmh.toFixed(0)} km/h) from Open-Meteo quick check.`)
  }
  if (!hints.length) return ''
  return `\n\n### AGRI WEATHER HEURISTICS (optional interpretation — verify with field/agronomy data)\n${hints.join('\n')}`
}

/** Compact Open-Meteo block when OpenWeather is primary — reduces duplicate prose while keeping a second numeric source. */
export async function buildOpenMeteoCompactComparisonBlock(lat: number, lng: number): Promise<string> {
  const lines: string[] = []
  lines.push(
    '### OPEN-METEO COMPACT (alternative source — cite “Open-Meteo” if you use these numbers; when OPENWEATHER FACTS is present, prefer it for current conditions unless it failed)',
  )
  lines.push(`Point: latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}`)
  try {
    const snap = await fetchOpenMeteoCurrentSnapshot(lat, lng)
    if (!snap || (snap.temp == null && snap.humidity == null && snap.windKmh == null)) {
      lines.push('Open-Meteo quick snapshot unavailable.')
    } else {
      lines.push(
        `Snapshot (approx): temp ${snap.temp != null ? `${snap.temp.toFixed(1)}°C` : 'n/a'}, humidity ${snap.humidity != null ? `${snap.humidity}%` : 'n/a'}, wind ${snap.windKmh != null ? `${snap.windKmh.toFixed(0)} km/h` : 'n/a'}.`,
      )
    }

    const fcUrl = new URL('https://api.open-meteo.com/v1/forecast')
    fcUrl.searchParams.set('latitude', String(lat))
    fcUrl.searchParams.set('longitude', String(lng))
    fcUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min')
    fcUrl.searchParams.set('forecast_days', '3')
    fcUrl.searchParams.set('timezone', 'auto')
    const res = await fetch(fcUrl.toString())
    if (res.ok) {
      const data = (await res.json()) as {
        daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[] }
      }
      const d = data.daily
      if (d?.time?.length) {
        lines.push('Next days (daily max/min):')
        for (let i = 0; i < Math.min(3, d.time.length); i++) {
          const day = d.time![i]
          const mx = d.temperature_2m_max?.[i]
          const mn = d.temperature_2m_min?.[i]
          lines.push(
            `  - ${day}: max ${typeof mx === 'number' ? `${mx.toFixed(1)}°C` : 'n/a'}, min ${typeof mn === 'number' ? `${mn.toFixed(1)}°C` : 'n/a'}`,
          )
        }
      }
    }
  } catch (e) {
    lines.push(`Open-Meteo compact error: ${e instanceof Error ? e.message : String(e)}`)
  }

  let out = lines.join('\n')
  if (out.length > 2200) out = `${out.slice(0, 2160)}\n[…truncated…]\n`
  return out
}

/**
 * Resolve coordinates for weather facts (map anchor → inspect/popup → named layer feature → place geocode → map fallback).
 */
export async function resolveGeoAiWeatherFactsCoords(input: {
  userText: string
  pinLngLat: [number, number] | null
  lastMapQueryCoords: [number, number] | null
  inspectAnchorLngLat: [number, number] | null
  combinedLayers: GeoAiMapLayer[]
  mapboxAccessToken?: string
}): Promise<WeatherFactsCoordResolution | null> {
  const { userText, combinedLayers, mapboxAccessToken } = input
  if (!geoExplorerUserMessageImpliesWeather(userText)) return null

  const pinCoords = input.pinLngLat ?? input.lastMapQueryCoords ?? null
  const inspectCoords = input.inspectAnchorLngLat

  const layerHit = findLngLatFromLayerQuery(userText, combinedLayers)
  const strongLayer =
    layerHit && layerHit.score >= GEO_EXPLORER_MIN_LAYER_PIN_SCORE ? layerHit : null

  const preferMap = weatherQueryPrefersMapAnchor(userText)
  const preferInspect = weatherQueryPrefersInspectSelection(userText)

  if (preferMap && pinCoords) {
    return { lng: pinCoords[0], lat: pinCoords[1], source: 'map_anchor', layerHit: strongLayer }
  }

  if (preferInspect && inspectCoords) {
    return {
      lng: inspectCoords[0],
      lat: inspectCoords[1],
      source: 'inspect_selection',
      layerHit: strongLayer,
    }
  }

  if (strongLayer) {
    return {
      lng: strongLayer.lng,
      lat: strongLayer.lat,
      source: 'layer_feature',
      layerHit: strongLayer,
    }
  }

  const placeQ = extractPlaceQueryForWeatherGeocode(userText)
  if (placeQ.length >= 2) {
    const box = await geocodePlaceToLngLat(placeQ, { mapboxAccessToken })
    if (box) {
      return {
        lng: box[0],
        lat: box[1],
        source: 'geocode',
        placeLabel: placeQ.slice(0, 160),
        layerHit: null,
      }
    }
    const om = await openMeteoForwardGeocode(placeQ)
    if (om) {
      return {
        lng: om.lng,
        lat: om.lat,
        source: 'geocode',
        placeLabel: om.name,
        layerHit: null,
      }
    }
  }

  if (pinCoords) {
    return { lng: pinCoords[0], lat: pinCoords[1], source: 'map_anchor', layerHit: null }
  }

  return null
}
