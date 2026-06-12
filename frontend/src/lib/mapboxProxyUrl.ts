/** Public Mapbox tile/style proxy — token injected server-side from MAPBOX_TOKEN env. */
import { resolveAbsoluteUrl, resolveApiUrl } from './apiClient'

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
  const proxied = `${resolveApiUrl(MAPBOX_PUBLIC_PROXY_PATH)}?url=${encodeURIComponent(upstreamUrl)}`
  return resolveAbsoluteUrl(proxied)
}

/** Browser UI language (e.g. `ar`, `en`) — Mapbox returns localized place names. */
function preferredGeocodingLanguage(): string {
  if (typeof navigator === 'undefined') return 'en'
  const raw = String(navigator.language || 'en').toLowerCase()
  const primary = raw.split('-')[0]
  return primary || 'en'
}

export function resolveMapboxGeocodingUrl(query: string, limit = 5, proximity?: string): string {
  const lim = Math.min(10, Math.max(1, limit))
  const params = new URLSearchParams({ q: query.trim(), limit: String(lim), language: preferredGeocodingLanguage() })
  if (proximity && proximity.trim()) params.set('proximity', proximity.trim())
  return `${resolveApiUrl(MAPBOX_PUBLIC_GEOCODING_PATH)}?${params.toString()}`
}

/**
 * Dev only: rewrite a direct `api.mapbox.com` URL (e.g. <img> thumbnails, prefetch)
 * to the Vite `/__mapbox` proxy so URL-restricted tokens work from localhost.
 * No-op in production builds and for non-Mapbox URLs.
 */
export function devMapboxProxyRewrite(url: string): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') return url
  try {
    const u = new URL(url, window.location.origin)
    if (u.hostname.toLowerCase() !== 'api.mapbox.com') return url
    return `/__mapbox${u.pathname}${u.search}`
  } catch {
    return url
  }
}
