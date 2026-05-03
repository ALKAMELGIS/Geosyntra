/**
 * Fallback geocoding for Geo Explorer when the model omits MAP_QUERY but the user asked for a place.
 * Mapbox Geocoding when a token exists; otherwise Nominatim (identifying User-Agent per usage policy).
 */

const PLACE_VERB_PREFIX =
  /^(?:open|show|go to|goto|navigate to|find|where is|where's|locate|map of|center on|fly to|zoom to)\s+/i

export function simplifyGeoExplorerUserQuery(raw: string): string {
  let s = raw.trim()
  s = s.replace(PLACE_VERB_PREFIX, '').trim()
  return s
}

/** Remove trailing "from … layer" so geocoders do not treat dataset names as place names. */
export function stripLayerReferenceForGeocode(raw: string): string {
  return raw
    .replace(/\bfrom\s+['"]?[\w\s-]+['"]?\s*layers?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function geocodePlaceToLngLat(
  query: string,
  opts: { mapboxAccessToken?: string },
): Promise<[number, number] | null> {
  const q = simplifyGeoExplorerUserQuery(query)
  if (!q || q.length > 280) return null

  try {
    const token = (opts.mapboxAccessToken || '').trim()
    if (token) {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(token)}&limit=1`,
      )
      if (!res.ok) return null
      const data = (await res.json()) as { features?: { center?: number[] }[] }
      const center = data?.features?.[0]?.center
      if (
        Array.isArray(center) &&
        center.length >= 2 &&
        Number.isFinite(center[0]) &&
        Number.isFinite(center[1])
      ) {
        return [center[0], center[1]]
      }
      return null
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'AgroCloud-SatelliteIntelligence/1.0 (Geo Explorer fallback)',
        },
      },
    )
    if (!res.ok) return null
    const arr = (await res.json()) as { lat?: string; lon?: string }[] | null
    const first = Array.isArray(arr) ? arr[0] : null
    if (!first) return null
    const lat = parseFloat(String(first.lat))
    const lon = parseFloat(String(first.lon))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    return [lon, lat]
  } catch {
    return null
  }
}
