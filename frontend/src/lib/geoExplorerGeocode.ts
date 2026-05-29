import { isMapboxGlInitPlaceholder, isMapboxSessionConfigured } from './mapboxAccessToken'
import { fetchMapboxGeocodingFeatures } from './mapboxGeocodeClient'
import { mustUseApiGateway } from './platformTokenRuntime'

const PLACE_VERB_PREFIX =
  /^(?:show\s+me|show|open|go\s+to|goto|navigate\s+to|find|where\s+is|where's|locate|map\s+of|center\s+on|centre\s+on|fly\s+to|zoom\s+to|display|pin)\s+/i

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

/** Strip command verbs and trailing "on/in the map" before Mapbox / Nominatim. */
export function normalizePlaceNameForGeocode(raw: string): string {
  let s = simplifyGeoExplorerUserQuery(raw.trim())
  s = stripLayerReferenceForGeocode(s)
  s = s.replace(/\s+(?:on|in)\s+(?:the\s+)?map\s*$/i, '').trim()
  s = s.replace(/\s+location\s*$/i, '').trim()
  s = s.replace(/^(?:the\s+)/i, '').trim()
  return s
}

export type GeocodeCandidate = {
  lng: number
  lat: number
  label: string
  /** Normalized confidence score in ~[0,1] — provider-dependent. */
  score: number
}

/** Minimum gap between #1 and #2 normalized scores to auto-select without ambiguity. */
const GEOCODE_AMBIGUITY_MARGIN = 0.11

export async function geocodePlaceCandidates(
  query: string,
  opts: { mapboxAccessToken?: string; limit?: number },
): Promise<GeocodeCandidate[]> {
  const q = normalizePlaceNameForGeocode(query)
  const lim = Math.min(8, Math.max(2, opts.limit ?? 5))
  if (!q || q.length > 280) return []

  try {
    if (mustUseApiGateway() && isMapboxSessionConfigured()) {
      const feats = await fetchMapboxGeocodingFeatures(q, lim)
      const out: GeocodeCandidate[] = []
      for (const f of feats) {
        const center = f?.center
        if (
          !Array.isArray(center) ||
          center.length < 2 ||
          !Number.isFinite(center[0]) ||
          !Number.isFinite(center[1])
        )
          continue
        const rel = typeof f.relevance === 'number' && Number.isFinite(f.relevance) ? f.relevance : 0.65
        const label =
          typeof f.place_name === 'string' && f.place_name.trim()
            ? f.place_name.trim()
            : typeof f.text === 'string'
              ? f.text.trim()
              : q
        out.push({ lng: center[0], lat: center[1], label, score: Math.max(0, Math.min(1, rel)) })
      }
      if (out.length) return out
    }

    const raw = (opts.mapboxAccessToken || '').trim()
    const token = raw && !isMapboxGlInitPlaceholder(raw) ? raw : ''
    if (token) {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(token)}&limit=${lim}&types=place,locality,region,country,address,poi`,
      )
      if (!res.ok) return []
      const data = (await res.json()) as {
        features?: { center?: number[]; place_name?: string; text?: string; relevance?: number }[]
      }
      const feats = Array.isArray(data?.features) ? data.features : []
      const out: GeocodeCandidate[] = []
      for (const f of feats) {
        const center = f?.center
        if (
          !Array.isArray(center) ||
          center.length < 2 ||
          !Number.isFinite(center[0]) ||
          !Number.isFinite(center[1])
        )
          continue
        const rel = typeof f.relevance === 'number' && Number.isFinite(f.relevance) ? f.relevance : 0.65
        const label =
          typeof f.place_name === 'string' && f.place_name.trim()
            ? f.place_name.trim()
            : typeof f.text === 'string'
              ? f.text.trim()
              : q
        out.push({ lng: center[0], lat: center[1], label, score: Math.max(0, Math.min(1, rel)) })
      }
      return out
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=${lim}&q=${encodeURIComponent(q)}`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'Geosyntra-SatelliteIntelligence/1.0 (Geo Explorer fallback)',
        },
      },
    )
    if (!res.ok) return []
    const arr = (await res.json()) as
      | { lat?: string; lon?: string; display_name?: string; importance?: number }[]
      | null
    if (!Array.isArray(arr) || !arr.length) return []
    let maxImp = 0
    for (const row of arr) {
      const imp = typeof row.importance === 'number' ? row.importance : 0
      if (imp > maxImp) maxImp = imp
    }
    const denom = maxImp > 0 ? maxImp : 1
    const out: GeocodeCandidate[] = []
    for (const row of arr) {
      const lat = parseFloat(String(row.lat))
      const lon = parseFloat(String(row.lon))
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      const label =
        typeof row.display_name === 'string' && row.display_name.trim()
          ? row.display_name.trim()
          : q
      const imp = typeof row.importance === 'number' ? row.importance : 0.35
      const score = Math.max(0.2, Math.min(1, imp / denom))
      out.push({ lng: lon, lat, label, score })
    }
    return out
  } catch {
    return []
  }
}

/** Pick one candidate only when score is high enough and not ambiguous vs runner-up. */
export function pickConfidentGeocode(candidates: GeocodeCandidate[]): {
  chosen: GeocodeCandidate | null
  ambiguous: boolean
} {
  if (!candidates.length) return { chosen: null, ambiguous: false }
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const top = sorted[0]!
  const second = sorted[1]
  const ambiguous = Boolean(second && top.score - second.score < GEOCODE_AMBIGUITY_MARGIN)
  const strongEnough = top.score >= 0.62
  if (!strongEnough || ambiguous) return { chosen: null, ambiguous: ambiguous || !strongEnough }
  return { chosen: top, ambiguous: false }
}

export async function geocodePlaceToLngLat(
  query: string,
  opts: { mapboxAccessToken?: string },
): Promise<[number, number] | null> {
  const candidates = await geocodePlaceCandidates(query, opts)
  const { chosen } = pickConfidentGeocode(candidates)
  return chosen ? [chosen.lng, chosen.lat] : null
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
    if (mustUseApiGateway() && isMapboxSessionConfigured()) {
      const feats = await fetchMapboxGeocodingFeatures(`${lng},${lat}`, 1)
      const primary = feats[0]
      if (primary) {
        const placeName =
          typeof primary.place_name === 'string'
            ? primary.place_name
            : typeof primary.text === 'string'
              ? primary.text
              : ''
        const place =
          (typeof primary.text === 'string' && primary.text.trim()) ||
          placeName.split(',')[0]?.trim() ||
          '—'
        return {
          place,
          country: '—',
          fullDescription: placeName || place,
        }
      }
    }

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
          'User-Agent': 'Geosyntra-SatelliteIntelligence/1.0 (Geo Explorer reverse)',
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
