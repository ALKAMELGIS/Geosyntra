import { useEffect, useState } from 'react'
import {
  GEOSYNTRA_DASHBOARD_KEEP_ALIVE_CHANGED_EVENT,
  readGeosyntraDashboardKeepAlive,
} from '../lib/geosyntraDashboardStorage'

/** Reactive subscription to “pin dashboard / keep iframe mounted” preference. */
export function useGeosyntraDashboardKeepAlive(): boolean {
  const [enabled, setEnabled] = useState(readGeosyntraDashboardKeepAlive)

  useEffect(() => {
    const onChange = () => setEnabled(readGeosyntraDashboardKeepAlive())
    window.addEventListener(GEOSYNTRA_DASHBOARD_KEEP_ALIVE_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(GEOSYNTRA_DASHBOARD_KEEP_ALIVE_CHANGED_EVENT, onChange)
  }, [])

  return enabled
}
