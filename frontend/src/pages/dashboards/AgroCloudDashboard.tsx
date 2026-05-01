import { useAgroCloudKeepAlive } from '../../hooks/useAgroCloudKeepAlive'
import './AgroCloudDashboard.css'
import AgroCloudDashboardFrame from './AgroCloudDashboardFrame'

/**
 * When “pin dashboard” is on: iframe lives in {@link PersistentAgroCloudEmbed} (no reload on return).
 * When off: inline iframe here so each visit remounts normally.
 */
export default function AgroCloudDashboard() {
  const keepAlive = useAgroCloudKeepAlive()
  if (!keepAlive) return <AgroCloudDashboardFrame />
  return <div className="agro-cloud-route-fill" />
}
