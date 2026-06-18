/**
 * Mapbox GL `transformRequest` — routes vendor URLs through public server proxy (no session).
 */
import { resolveAbsoluteUrl } from '../../../lib/apiClient'
import { shouldProxyMapboxRequests } from '../../../lib/mapboxAccessToken'
import { isMapboxVendorUrl, resolveMapboxProxyUrl } from '../../../lib/mapboxProxyUrl'

/**
 * Local dev: public `pk.*` tokens are URL-restricted to the production origin, so the
 * browser cannot fetch `api.mapbox.com` tiles directly from localhost (403). Route them
 * through the Vite `/__mapbox` proxy, which injects the allowed `Referer` server-side.
 */
function rewriteForMapboxDevProxy(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.toLowerCase() !== 'api.mapbox.com') return null
    return resolveAbsoluteUrl(`/__mapbox${u.pathname}${u.search}`)
  } catch {
    return null
  }
}

export function createSiMapTransformRequest(sentinelAccessToken: string | null | undefined) {
  const token = typeof sentinelAccessToken === 'string' ? sentinelAccessToken.trim() : ''
  return (url: string, resourceType: string) => {
    if (shouldProxyMapboxRequests() && isMapboxVendorUrl(url)) {
      return { url: resolveMapboxProxyUrl(url) }
    }
    if (import.meta.env.DEV) {
      const devProxied = rewriteForMapboxDevProxy(url)
      if (devProxied) return { url: devProxied }
    }
    if (resourceType === 'Tile' && url.includes('services.sentinel-hub.com') && token) {
      return { url, headers: { Authorization: `Bearer ${token}` } }
    }
    return { url }
  }
}
