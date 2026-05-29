/**
 * Mapbox geocoding via public backend proxy — no browser token or session.
 */
import { mustUseApiGateway } from './platformTokenRuntime'
import { resolveMapboxGeocodingUrl } from './mapboxProxyUrl'

export async function fetchMapboxGeocodingFeatures(
  query: string,
  limit = 5,
): Promise<
  { center?: number[]; place_name?: string; text?: string; relevance?: number; context?: unknown[] }[]
> {
  const q = query.trim()
  if (!q) return []

  if (mustUseApiGateway()) {
    try {
      const res = await fetch(resolveMapboxGeocodingUrl(q, limit))
      if (!res.ok) return []
      const data = (await res.json()) as {
        features?: { center?: number[]; place_name?: string; text?: string; relevance?: number }[]
      }
      return Array.isArray(data?.features) ? data.features : []
    } catch {
      return []
    }
  }

  return []
}
