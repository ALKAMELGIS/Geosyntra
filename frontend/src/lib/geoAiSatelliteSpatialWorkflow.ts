/**
 * Satellite Intelligence — Geo AI: defer tabular vector stats when the user is
 * clearly asking for a coordinate-driven RS / GIS workflow (buffers, Sentinel,
 * indices, classification). Lets Gemini / Claude / DeepSeek answer with MAP_QUERY
 * and a staged plan instead of the generic “no layer records” short-circuit.
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

/**
 * When true, `runGeoAiStatsCommand` should **not** return the empty-vector fallback
 * (“No loaded layer records…”) so the LLM path can run with full spatial context.
 */
export function spatialWorkflowOverridesTabularStats(query: string): boolean {
  const q = query.trim()
  if (q.length < 24) return false
  if (!messageHasDecimalDegreePair(q)) return false
  return messageImpliesRemoteSensingOrBufferWorkflow(q)
}
