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

export type ReverseGeocodeResult = {
  /** Short place / locality label (city, town, suburb, etc.). */
  place: string
  country: string
  /** Full line suitable for subtitles (Mapbox place_name or Nominatim display_name). */
  fullDescription: string
}

function nominatimPlaceFromAddress(addr: Record<string, unknown> | null | undefined): string {
  if (!addr || typeof addr !== 'object') return ''
  const keys = [
    'village',
    'town',
    'city',
    'municipality',
    'suburb',
    'hamlet',
    'neighbourhood',
    'quarter',
    'county',
    'state',
    'region',
  ] as const
  for (const k of keys) {
    const v = addr[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * Reverse geocode for Geo Explorer map popups (place + country).
 * Prefers Mapbox when a token exists; otherwise OpenStreetMap Nominatim.
 */
export async function reverseGeocodeLngLat(
  lng: number,
  lat: number,
  opts: { mapboxAccessToken?: string },
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  try {
    const token = (opts.mapboxAccessToken || '').trim()
    if (token) {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${lng},${lat}`)}.json?access_token=${encodeURIComponent(token)}&limit=1`,
      )
      if (!res.ok) return null
      const data = (await res.json()) as {
        features?: { text?: string; place_name?: string; context?: { id?: string; text?: string }[] }[]
      }
      const primary = data?.features?.[0]
      if (!primary) return null
      const placeName =
        typeof primary.place_name === 'string'
          ? primary.place_name
          : typeof primary.text === 'string'
            ? primary.text
            : ''
      let country = ''
      const ctx = Array.isArray(primary.context) ? primary.context : []
      for (const c of ctx) {
        if (typeof c?.id === 'string' && c.id.startsWith('country.')) {
          country = (typeof c.text === 'string' && c.text.trim()) || ''
          break
        }
      }
      const place =
        (typeof primary.text === 'string' && primary.text.trim()) ||
        placeName.split(',')[0]?.trim() ||
        '—'
      return {
        place,
        country: country || '—',
        fullDescription: placeName || `${place}, ${country}`.trim(),
      }
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'AgroCloud-SatelliteIntelligence/1.0 (Geo Explorer reverse)',
        },
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      display_name?: string
      address?: Record<string, unknown>
    }
    const display =
      typeof data?.display_name === 'string' && data.display_name.trim()
        ? data.display_name.trim()
        : ''
    const addr = data?.address
    const area = nominatimPlaceFromAddress(addr)
    const countryRaw = addr && typeof addr.country === 'string' ? addr.country.trim() : ''
    const displayParts = display ? display.split(',').map(s => s.trim()).filter(Boolean) : []
    const place = area || displayParts[0] || '—'
    return {
      place,
      country: countryRaw || '—',
      fullDescription: display || `${place}, ${countryRaw}`.trim(),
    }
  } catch {
    return null
  }
}
