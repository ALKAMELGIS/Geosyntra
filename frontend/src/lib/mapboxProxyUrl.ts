/** Public Mapbox tile/style proxy — token injected server-side from MAPBOX_TOKEN env. */
import { resolveApiUrl } from './apiClient'

export const MAPBOX_PUBLIC_PROXY_PATH = '/api/mapbox-proxy'
export const MAPBOX_PUBLIC_GEOCODING_PATH = '/api/gateway/mapbox/geocoding'

export function isMapboxVendorUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'mapbox.com' || host.endsWith('.mapbox.com')
  } catch {
    return false
  }
}

export function resolveMapboxProxyUrl(upstreamUrl: string): string {
  return `${resolveApiUrl(MAPBOX_PUBLIC_PROXY_PATH)}?url=${encodeURIComponent(upstreamUrl)}`
}

export function resolveMapboxGeocodingUrl(query: string, limit = 5): string {
  const q = encodeURIComponent(query.trim())
  const lim = Math.min(10, Math.max(1, limit))
  return `${resolveApiUrl(MAPBOX_PUBLIC_GEOCODING_PATH)}?q=${q}&limit=${lim}`
}
