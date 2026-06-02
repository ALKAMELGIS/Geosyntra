import type { RouteElevationSample } from '../../../lib/geoAiRoutePlan'
import './SiRouteElevationChart.css'

export function SiRouteElevationChart({ profile }: { profile: RouteElevationSample[] }) {
  if (!profile.length) return null
  const w = 280
  const h = 72
  const minE = Math.min(...profile.map(p => p.elevationM))
  const maxE = Math.max(...profile.map(p => p.elevationM))
  const maxD = profile[profile.length - 1]?.distanceM || 1
  const pad = 4
  const rangeE = Math.max(1, maxE - minE)

  const pts = profile
    .map(p => {
      const x = pad + ((p.distanceM / maxD) * (w - pad * 2))
      const y = h - pad - ((p.elevationM - minE) / rangeE) * (h - pad * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="si-route-elev">
      <div className="si-route-elev__head">
        <span>Elevation profile</span>
        <span className="si-route-elev__range">
          {Math.round(minE)}–{Math.round(maxE)} m
        </span>
      </div>
      <svg className="si-route-elev__chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Elevation profile">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  )
}
