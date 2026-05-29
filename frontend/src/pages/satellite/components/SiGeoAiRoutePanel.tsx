import type { GeoAiRouteSession, GeoAiTravelMode } from '../../../lib/geoAiRoutePlan'
import './SiGeoAiRoutePanel.css'

export type SiGeoAiRoutePanelProps = {
  session: GeoAiRouteSession
  onSelectIndex: (index: number) => void
  onTravelModeChange: (mode: GeoAiTravelMode) => void
  onClose: () => void
  busy?: boolean
}

const MODES: { id: GeoAiTravelMode; label: string; icon: string }[] = [
  { id: 'DRIVE', label: 'Drive', icon: 'fa-car' },
  { id: 'WALK', label: 'Walk', icon: 'fa-person-walking' },
  { id: 'BICYCLE', label: 'Cycle', icon: 'fa-bicycle' },
]

export function SiGeoAiRoutePanel({
  session,
  onSelectIndex,
  onTravelModeChange,
  onClose,
  busy = false,
}: SiGeoAiRoutePanelProps) {
  const active = session.options[session.selectedIndex] ?? session.options[0]
  const provider =
    session.provider === 'graphhopper'
      ? 'GraphHopper'
      : session.provider === 'openrouteservice'
        ? 'OpenRouteService'
        : session.provider === 'google_maps_platform'
          ? 'Google Routes'
          : 'Routing'

  return (
    <aside className="si-geo-ai-route-panel" role="region" aria-label="Route analysis">
      <header className="si-geo-ai-route-panel__head">
        <div className="si-geo-ai-route-panel__title-wrap">
          <i className="fa-solid fa-route" aria-hidden />
          <div>
            <h3 className="si-geo-ai-route-panel__title">Route analysis</h3>
            <p className="si-geo-ai-route-panel__provider">{provider}</p>
          </div>
        </div>
        <button type="button" className="si-geo-ai-route-panel__close" onClick={onClose} aria-label="Close route panel">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="si-geo-ai-route-panel__endpoints">
        <div className="si-geo-ai-route-panel__ep">
          <span className="si-geo-ai-route-panel__ep-k">From</span>
          <span className="si-geo-ai-route-panel__ep-v">{session.origin.label}</span>
        </div>
        <div className="si-geo-ai-route-panel__ep">
          <span className="si-geo-ai-route-panel__ep-k">To</span>
          <span className="si-geo-ai-route-panel__ep-v">{session.destination.label}</span>
        </div>
      </div>

      <div className="si-geo-ai-route-panel__modes" role="group" aria-label="Travel mode">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`si-geo-ai-route-panel__mode${session.travelMode === m.id ? ' is-active' : ''}`}
            disabled={busy}
            onClick={() => onTravelModeChange(m.id)}
          >
            <i className={`fa-solid ${m.icon}`} aria-hidden />
            {m.label}
          </button>
        ))}
      </div>

      {active ? (
        <div className="si-geo-ai-route-panel__summary">
          <div>
            <span className="si-geo-ai-route-panel__metric-k">Distance</span>
            <strong>{active.distanceLabel}</strong>
          </div>
          <div>
            <span className="si-geo-ai-route-panel__metric-k">Duration</span>
            <strong>{active.durationLabel}</strong>
          </div>
        </div>
      ) : null}

      {session.options.length > 1 ? (
        <ul className="si-geo-ai-route-panel__alts">
          {session.options.map((opt, i) => (
            <li key={opt.id}>
              <button
                type="button"
                className={`si-geo-ai-route-panel__alt${session.selectedIndex === i ? ' is-active' : ''}`}
                onClick={() => onSelectIndex(i)}
              >
                <span className="si-geo-ai-route-panel__alt-label">{opt.label}</span>
                <span className="si-geo-ai-route-panel__alt-meta">
                  {opt.durationLabel} · {opt.distanceLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  )
}
