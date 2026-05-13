import './GeosyntraDashboard.css'

/**
 * Dashboard page always renders the persistent host container.
 * The embedded iframe is mounted globally by PersistentGeosyntraDashboardEmbed for instant route open.
 */
export default function GeosyntraDashboard() {
  return <div className="geosyntra-dashboard-route-fill" />
}
