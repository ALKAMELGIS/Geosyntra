/**
 * Geo AI Agent — intent classification & validation (preflight pipeline).
 * Question → intent → validate → tool router → map sync + answer.
 */

import { normalizePlaceNameForGeocode } from './geoExplorerGeocode'

export type GeoAiAgentIntentType =
  | 'map_place'
  | 'route'
  | 'places_poi'
  | 'spatial_analysis'
  | 'zonal_stats'
  | 'rs_toolbox'
  | 'general'

export type GeoAiAgentIntent = {
  type: GeoAiAgentIntentType
  /** Place name for geocode / fly-to when type is map_place. */
  placeText?: string
}

export type GeoAiAgentContext = {
  aoi: boolean
  layersCount: number
  hasTimeline: boolean
  pinLngLat: [number, number] | null
}

export type GeoAiValidationResult =
  | { ok: true }
  | { ok: false; reason: string; reasonAr?: string }

const SHOW_PLACE_ON_MAP_RE =
  /\b(?:show\s+me|display|locate|find|pin|zoom\s+to|fly\s+to|go\s+to|center\s+on|centre\s+on)\s+(.+?)\s+(?:location\s+)?(?:on|in)\s+(?:the\s+)?map\b/i

const WHERE_IS_RE = /\b(?:where\s+is|where's|location\s+of|find\s+(?:the\s+)?location\s+of)\s+(.+?)(?:\?|$|\.)/i

const SHOW_ME_PLACE_RE = /\bshow\s+me\s+(.+?)(?:\?|\.|$)/i
const ZOOM_TO_PLACE_RE = /\bzoom\s+(?:in\s+)?to\s+(.+?)(?:\?|\.|$)/i
const GO_TO_PLACE_RE = /\b(?:go|fly|pan|center|centre)\s+to\s+(.+?)(?:\?|\.|$)/i
const OPEN_ON_MAP_RE = /\bopen\s+(.+?)\s+on\s+(?:the\s+)?map\b/i
const SHOW_ME_PLACE_AR = /(?:أرني|اعرض\s+لي)\s+(.+?)(?:\?|\.|$)/u

function isLikelyLayerOrRsPhrase(text: string): boolean {
  return /\b(ndvi|ndwi|layer|layers|wms|raster|timeline|sentinel|records|features|statistics|overlay|imagery|table|average|mean|sum|count|group\s*by|buffer|aoi|polygon|classification|remote\s+sensing|visibility|tabular|spreadsheet)\b/i.test(
    text,
  )
}

function looksLikeGisAssetId(text: string): boolean {
  return /\b[A-Za-z]{1,5}\d{2,6}(?:[-_/][A-Za-z0-9]{1,12})?\b/.test(text.trim())
}

function queryMentionsLayerContext(query: string): boolean {
  return /\blayer\b|طبقة|from\s+[\w.-]+\s+layer\b/i.test(query)
}

function isBlockedMapPlaceCandidate(query: string, place: string): boolean {
  if (isLikelyLayerOrRsPhrase(place)) return true
  if (queryMentionsLayerContext(query) && looksLikeGisAssetId(place)) return true
  return false
}

function cleanPlaceCandidate(raw: string): string {
  return normalizePlaceNameForGeocode(raw)
}

/** Named place in "Show me Dubai", "go to Paris", etc. — not layer/RS commands. */
export function resolveGeographicPlaceFromQuery(query: string): string | null {
  const q = query.trim()
  if (!q) return null

  const mOnMap = q.match(SHOW_PLACE_ON_MAP_RE)
  if (mOnMap?.[1]) {
    const place = cleanPlaceCandidate(mOnMap[1])
    if (place.length >= 2 && !isBlockedMapPlaceCandidate(q, place)) return place
  }
  const mWhere = q.match(WHERE_IS_RE)
  if (mWhere?.[1]) {
    const place = mWhere[1].trim()
    if (place.length >= 2 && !isBlockedMapPlaceCandidate(q, place)) return place
  }

  const patterns = [SHOW_ME_PLACE_RE, ZOOM_TO_PLACE_RE, GO_TO_PLACE_RE, OPEN_ON_MAP_RE, SHOW_ME_PLACE_AR]
  for (const re of patterns) {
    const m = q.match(re)
    if (!m?.[1]) continue
    const place = cleanPlaceCandidate(m[1])
    if (place.length >= 2 && place.length <= 120 && !isBlockedMapPlaceCandidate(q, place)) return place
  }
  return null
}

/** User wants a named place on the map — not RS layer toggles. */
export function isMapPlaceShowOrGeocodeQuery(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (/\b(route|directions?|navigate|from\s+.+\s+to\s+)\b/i.test(q)) return false
  if (resolveGeographicPlaceFromQuery(q)) return true
  if (SHOW_PLACE_ON_MAP_RE.test(q) || WHERE_IS_RE.test(q)) return true
  if (/\b(show|display|locate|find)\b/i.test(q) && /\bon\s+(?:the\s+)?map\b/i.test(q)) {
    if (/\b(ndvi|wms|overlay|imagery|raster|timeline|remote\s+sensing|sentinel|layer\s+visibility)\b/i.test(q)) {
      return false
    }
    return true
  }
  return false
}

export function extractMapPlaceText(query: string): string | null {
  const q = query.trim()
  const m1 = q.match(SHOW_PLACE_ON_MAP_RE)
  if (m1?.[1]) {
    const place = cleanPlaceCandidate(m1[1])
    if (place.length >= 2 && !isBlockedMapPlaceCandidate(q, place)) return place
  }
  const m2 = q.match(WHERE_IS_RE)
  if (m2?.[1]) {
    const place = m2[1].trim()
    if (place.length >= 2 && !isBlockedMapPlaceCandidate(q, place)) return place
  }
  return null
}

export function detectGeoAiAgentIntent(query: string): GeoAiAgentIntent {
  const q = query.trim()
  if (!q) return { type: 'general' }

  const placeText = extractMapPlaceText(q) ?? resolveGeographicPlaceFromQuery(q)
  if (placeText || isMapPlaceShowOrGeocodeQuery(q)) {
    return { type: 'map_place', placeText: placeText ?? undefined }
  }

  if (/\b(directions?|route\b|navigate\s+to|drive\s+to|how\s+(?:do\s+i\s+|to\s+)?get\s+to)\b/i.test(q)) {
    return { type: 'route' }
  }

  if (
    /\b(hotel|restaurant|hospital|pharmacy|places?\s+near|near\s+me|nearby|poi)\b/i.test(q) ||
    /\b(find\s+(?:hotels?|restaurants?|hospitals?|places))\b/i.test(q)
  ) {
    return { type: 'places_poi' }
  }

  if (/\b(zonal|mean\s+in\s+aoi|average\s+in\s+aoi|statistics\s+in\s+aoi|متوسط|احصاء)\b/i.test(q)) {
    return { type: 'zonal_stats' }
  }

  if (
    /\b(ndvi|ndwi|sentinel|timeline|remote\s+sensing|generate\s+timeline|run\s+analysis|imagery\s+date)\b/i.test(q) &&
    /\b(set|switch|show|display|render|hide|enable|generate|run|open|analysis)\b/i.test(q)
  ) {
    return { type: 'rs_toolbox' }
  }

  if (/\b(analy[sz]e|analysis|classif|heatmap|change\s+detection|buffer)\b/i.test(q)) {
    return { type: 'spatial_analysis' }
  }

  return { type: 'general' }
}

export function validateGeoAiAgentRequest(
  intent: GeoAiAgentIntent,
  context: GeoAiAgentContext,
): GeoAiValidationResult {
  switch (intent.type) {
    case 'map_place':
    case 'route':
    case 'places_poi':
      return { ok: true }
    case 'spatial_analysis':
    case 'zonal_stats':
      if (!context.aoi) {
        return {
          ok: false,
          reason:
            'Draw or select an **AOI** on the map first (polygon tool in Fields), then ask for analysis again.',
          reasonAr: 'يرجى تحديد منطقة AOI على الخريطة أولاً، ثم أعد طلب التحليل.',
        }
      }
      if (!context.layersCount) {
        return {
          ok: false,
          reason:
            'No analysis layers are loaded. Add a vector layer or run **Generate timeline** with a Sentinel index after defining an AOI.',
        }
      }
      return { ok: true }
    case 'rs_toolbox':
      return { ok: true }
    default:
      return { ok: true }
  }
}
