/**
 * Mapbox GL `transformRequest` — routes vendor URLs through public server proxy (no session).
 */
import { shouldProxyMapboxRequests } from '../../../lib/mapboxAccessToken'
import { isMapboxVendorUrl, resolveMapboxProxyUrl } from '../../../lib/mapboxProxyUrl'

export function createSiMapTransformRequest(sentinelAccessToken: string | null | undefined) {
  const token = typeof sentinelAccessToken === 'string' ? sentinelAccessToken.trim() : ''
  return (url: string, resourceType: string) => {
    if (shouldProxyMapboxRequests() && isMapboxVendorUrl(url)) {
      return { url: resolveMapboxProxyUrl(url) }
    }
    if (resourceType === 'Tile' && url.includes('services.sentinel-hub.com') && token) {
      return { url, headers: { Authorization: `Bearer ${token}` } }
    }
    return { url }
  }
}
