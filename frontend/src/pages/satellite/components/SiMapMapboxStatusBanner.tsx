import type { MapboxSessionSnapshot } from '../../../lib/mapboxSessionToken'
import './SiMapMapboxStatusBanner.css'

type Props = {
  session: MapboxSessionSnapshot
  onRetry?: () => void
}

function bannerMessage(session: MapboxSessionSnapshot): string | null {
  if (session.status === 'loading' || session.status === 'idle') return null
  // Proxy-only Mapbox (server token without pk in browser) is valid — no end-user banner.
  if (session.configured && (session.hasPublicToken || session.proxyMode)) return null
  if (session.status === 'error') {
    if (session.error === 'mapbox_config_network_error') {
      return 'Cannot reach the GeoSyntra API — Mapbox basemaps are unavailable. Esri satellite is shown until the API is restored.'
    }
    return 'Mapbox is not configured on the API host. Esri satellite basemap is active.'
  }
  if (session.status === 'ready' && !session.configured) {
    return 'Mapbox token missing on api.geosyntra.org — using Esri satellite basemap.'
  }
  return null
}

export function SiMapMapboxStatusBanner({ session, onRetry }: Props) {
  const message = bannerMessage(session)
  if (!message) return null

  return (
    <div className="si-map-mapbox-status" role="status" aria-live="polite">
      <span className="si-map-mapbox-status__icon" aria-hidden>
        <i className="fa-solid fa-triangle-exclamation" />
      </span>
      <p className="si-map-mapbox-status__text">{message}</p>
      {onRetry && session.status === 'error' ? (
        <button type="button" className="si-map-mapbox-status__retry" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}
