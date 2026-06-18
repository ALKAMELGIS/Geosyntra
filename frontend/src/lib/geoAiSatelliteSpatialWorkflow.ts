/**
 * Satellite Intelligence — Geo AI: defer tabular vector stats when the user is
 * clearly asking for a coordinate-driven RS / GIS workflow (buffers, Sentinel,
 * indices, classification), **map-only follow-ups** (“show on map”, “confirm … map”),
 * or **open-data / population / admin-boundary** phrasing. Lets Gemini / Claude /
 * DeepSeek answer with MAP_QUERY and a staged plan instead of the generic
 * “no layer records” short-circuit.
 */

/** Two decimal numbers that can be read as WGS84 (lng,lat) in either order. */
function messageHasDecimalDegreePair(q: string): boolean {
  const re = /\b(-?\d{1,3}\.\d{3,})\s*[,;\s]+\s*(-?\d{1,3}\.\d{3,})\b/g
  let m: RegExpExecArray | null
  const okLngLat = (lng: number, lat: number) =>
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
  while ((m = re.exec(q)) !== null) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (okLngLat(a, b) || okLngLat(b, a)) return true
  }
  return false
}

function messageImpliesRemoteSensingOrBufferWorkflow(q: string): boolean {
  const t = q.toLowerCase()
  return (
    /\b(buffer|radius|\d+\s*km|\d+\s*mi\b|kilometer|kilometre|meters?\s+around|metres?\s+around|ring|donut)\b/i.test(
      q,
    ) ||
    /\b(sentinel[-\s]?[12]|sentinel\s*2|s2\s*l2a|ndvi|ndwi|savi|evi|ndmi|lst|bsi|nbr|ndre|mndwi)\b/i.test(q) ||
    /\b(classif|vegetation\s+health|spectral|cloud[-\s]?free|least\s+cloud|best\s+scene|raster|heatmap|zonal|clip\s+raster|time\s*series|change\s*detection)\b/i.test(
      q,
    ) ||
    /\b(create\s+(a\s+)?point|draw\s+polygon|multi[-\s]?aoi|spatial\s+join|terrain|flood|urban\s+expansion)\b/i.test(
      q,
    ) ||
    /\b(imagery|geo\s*tiff|geotiff|export\s+report|workflow|pipeline)\b/i.test(t)
  )
}

/** Map-only follow-ups (“show on map”, “confirm … map”) — no coords; still defer tabular stats so the LLM can plan MAP_QUERY / anchors. */
function explicitMapVisualizationDeferStats(q: string): boolean {
  const t = q.trim()
  if (t.length < 10) return false
  return (
    /\b(show\s+me\s+on\s+the\s+map|show\s+me\s+on\s+map|display\s+on\s+the\s+map|display\s+on\s+map|on\s+the\s+map|on\s+map\b|visualize\s+on\s+map|pin\s+on\s+map)\b/i.test(
      t,
    ) || /\bconfirm\b[\s\S]{0,48}\bmap\b/i.test(t)
  )
}

/** Population / global admin / open-data phrasing — defer to LLM workflow instead of empty-layer short-circuit. */
function externalDatasetWorkflowDeferStats(q: string): boolean {
  const t = q.trim()
  if (t.length < 28) return false
  return /\b(population\s+density|worldpop|gpw|geoboundaries|natural\s+earth|openstreetmap|\bosm\b|country\s+boundary|admin\s+boundary|choropleth|demographic|classify\s+into\s+\d+|jenks|quantile\s+bin)\b/i.test(
    t,
  )
}

import { isMapPlaceShowOrGeocodeQuery } from './geoAiAgentIntent'

/**
 * Place / POI / routing / weather asks — must reach Gemini (and optional Google grounding),
 * not the local vector stats short-circuit.
 */
export function isGeoExplorerPlaceDiscoveryQuestion(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (isMapPlaceShowOrGeocodeQuery(q)) return true
  if (/\b(layer|feature\s+id|attribute\s+table|where\s+clause|group\s*by|sql\s+where|calculate\s+field)\b/i.test(q)) {
    return false
  }
  return (
    /\b(hotel|hotels|motel|lodging|accommodation|hostel|resort|restaurant|cafe|coffee|pharmacy|hospital|gas\s+station|supermarket|atm|museum|park|poi|places?\s+near|near\s+this\s+place|near\s+me|around\s+here|nearby)\b/i.test(
      q,
    ) ||
    /\b(show\s+me\s+(?:the\s+)?route|route\s+(?:on|in)\s+(?:the\s+)?map|route\s+analysis|route\s+to\s+this\s+place|directions?\s+to|navigate\s+to|drive\s+to|how\s+(?:do\s+i\s+|to\s+)?get\s+to|walking\s+route|cycling\s+route|bicycl\w*\s+route)\b/i.test(
      q,
    ) ||
    (/\broute\b/i.test(q) && /\b(map|navigate|directions?|driving|walking|cycling|from|to)\b/i.test(q)) ||
    /\b(weather\s+at|weather\s+in|weather\s+for|forecast\s+for|what(?:'s| is)\s+the\s+weather|temperature\s+at|temperature\s+in)\b/i.test(
      q,
    ) ||
    /\b(find\s+(?:hotels?|restaurants?|places|a\s+hotel|some\s+hotels)|search\s+for\s+(?:hotels?|restaurants?|places))\b/i.test(
      q,
    ) ||
    /(?:فندق|فنادق|مطعم|قريب|بالقرب|أماكن|الطقس|اتجاهات|مسار|طريق\s+إلى|أين\s+تقع)/i.test(q)
  )
}

/**
 * When true, `runGeoAiStatsCommand` should **not** return the empty-vector fallback
 * (“No loaded layer records…”) so the LLM path can run with full spatial context.
 */
export function spatialWorkflowOverridesTabularStats(query: string): boolean {
  const q = query.trim()
  if (isGeoExplorerPlaceDiscoveryQuestion(q)) return true
  if (explicitMapVisualizationDeferStats(q)) return true
  if (externalDatasetWorkflowDeferStats(q)) return true
  if (q.length < 24) return false
  if (!messageHasDecimalDegreePair(q)) return false
  return messageImpliesRemoteSensingOrBufferWorkflow(q)
}
