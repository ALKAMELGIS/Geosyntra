import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '../lib/i18n'
import {
  GEOSYNTRA_DASHBOARD_EMBED_CHANGED_EVENT,
  readGeosyntraDashboardUrl,
} from '../lib/geosyntraDashboardStorage'
import '../pages/dashboards/GeosyntraDashboard.css'

const GEOSYNTRA_DASHBOARD_ROUTE = '/dashboards/geosyntra'

/**
 * When “pin dashboard” is enabled: keeps the ArcGIS iframe mounted once visited so navigating away
 * and back does not reload the embedded dashboard.
 */
export default function PersistentGeosyntraDashboardEmbed() {
  const location = useLocation()
  const { language } = useLanguage()
  const active = location.pathname === GEOSYNTRA_DASHBOARD_ROUTE
  const [embedUrl, setEmbedUrl] = useState(readGeosyntraDashboardUrl)

  useEffect(() => {
    const sync = () => setEmbedUrl(readGeosyntraDashboardUrl())
    window.addEventListener(GEOSYNTRA_DASHBOARD_EMBED_CHANGED_EVENT, sync)
    return () => window.removeEventListener(GEOSYNTRA_DASHBOARD_EMBED_CHANGED_EVENT, sync)
  }, [])

  const copy = useMemo(
    () =>
      language === 'ar'
        ? {
            title: 'لوحة منصة جيوسينترا',
            invalid: 'الرابط غير صالح (استخدم http/https)',
          }
        : {
            title: 'Geosyntra Platform Dashboard',
            invalid: 'Invalid URL — use https://…',
          },
    [language],
  )

  const iframeSrc = embedUrl

  return (
    <div
      className={`persistent-geosyntra-dashboard-layer ${active ? 'persistent-geosyntra-dashboard-layer--active' : ''}`}
      aria-hidden={!active}
    >
      <div className="page page-tight geosyntra-dashboard-page persistent-geosyntra-dashboard-layer-inner">
        <div className="geosyntra-dashboard-frame-wrap">
          {iframeSrc ? (
            <iframe
              title={copy.title}
              src={iframeSrc}
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="geosyntra-dashboard-error">{copy.invalid}</div>
          )}
        </div>
      </div>
    </div>
  )
}
