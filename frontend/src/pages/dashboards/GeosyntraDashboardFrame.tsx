import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../../lib/i18n'
import {
  GEOSYNTRA_DASHBOARD_EMBED_CHANGED_EVENT,
  readGeosyntraDashboardUrl,
} from '../../lib/geosyntraDashboardStorage'
import './GeosyntraDashboard.css'

/** Inline iframe when “pin dashboard” is off — remounts when leaving the route. */
export default function GeosyntraDashboardFrame() {
  const { language } = useLanguage()
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
    <div className="page page-tight geosyntra-dashboard-page">
      <div className="geosyntra-dashboard-frame-wrap">
        {iframeSrc ? (
          <iframe title={copy.title} src={iframeSrc} allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <div className="geosyntra-dashboard-error">{copy.invalid}</div>
        )}
      </div>
    </div>
  )
}
