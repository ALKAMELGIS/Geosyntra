import type { VrpAnalysisReport, VrpSettings, VrpVehicleRoute } from '../utils/siVrpTypes';

export type VrpPickTarget = 'vrp-depot' | 'vrp-stop' | null;

export type SiRouteMapVrpSectionProps = {
  busy: boolean;
  hasOrsKey: boolean;
  pickTarget: VrpPickTarget;
  onPickTargetChange: (t: VrpPickTarget) => void;
  depotText: string;
  onDepotTextChange: (v: string) => void;
  stopsText: string;
  onStopsTextChange: (v: string) => void;
  settings: VrpSettings;
  onSettingsChange: (v: VrpSettings) => void;
  onCompute: () => void;
  report: VrpAnalysisReport | null;
  routes: VrpVehicleRoute[];
  error?: string | null;
};

function patchSettings(prev: VrpSettings, patch: Partial<VrpSettings>): VrpSettings {
  return { ...prev, ...patch };
}

function clampIntField(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function SiRouteMapVrpSection({
  busy,
  hasOrsKey,
  pickTarget,
  onPickTargetChange,
  depotText,
  onDepotTextChange,
  stopsText,
  onStopsTextChange,
  settings,
  onSettingsChange,
  onCompute,
  report,
  routes,
  error,
}: SiRouteMapVrpSectionProps) {
  const patch = (p: Partial<VrpSettings>) => onSettingsChange(patchSettings(settings, p));
  const stopLines = stopsText.trim().split('\n').filter(Boolean).length;

  return (
    <>
      <p className="si-route-map-panel__matrix-hint">
        Depot + stops — <code>lat,lng</code> or address. Optimize multi-vehicle routes on the road network.
      </p>

      <div className="si-vrp-pick-row">
        <button
          type="button"
          className={`si-route-map-panel__pick si-route-map-panel__pick--compact${pickTarget === 'vrp-depot' ? ' is-active' : ''}`}
          disabled={busy}
          onClick={() => onPickTargetChange(pickTarget === 'vrp-depot' ? null : 'vrp-depot')}
        >
          <i className="fa-solid fa-warehouse" aria-hidden />
          Pick depot
        </button>
        <button
          type="button"
          className={`si-route-map-panel__pick si-route-map-panel__pick--compact${pickTarget === 'vrp-stop' ? ' is-active' : ''}`}
          disabled={busy}
          onClick={() => onPickTargetChange(pickTarget === 'vrp-stop' ? null : 'vrp-stop')}
        >
          <i className="fa-solid fa-plus" aria-hidden />
          Pick stop
        </button>
      </div>

      <label className="si-route-map-panel__field">
        <span className="si-route-map-panel__field-k">
          <i className="fa-solid fa-warehouse" />
          Depot / start
        </span>
        <input
          className="si-route-map-panel__input"
          value={depotText}
          onChange={e => onDepotTextChange(e.target.value)}
          placeholder="Depot lat,lng or address"
          disabled={busy}
        />
      </label>

      <label className="si-route-map-panel__field">
        <span className="si-route-map-panel__field-k">
          <i className="fa-solid fa-location-dot" />
          Stops ({stopLines})
        </span>
        <textarea
          className="si-route-map-panel__textarea"
          rows={4}
          value={stopsText}
          onChange={e => onStopsTextChange(e.target.value)}
          placeholder={'Stop A, 15.64, 32.53\n15.65, 32.62\nWarehouse B'}
          disabled={busy}
        />
      </label>

      <p className="si-route-map-panel__section-label">Vehicles & constraints</p>
      <div className="si-vrp-grid">
        <label className="si-vrp-field">
          <span>Vehicles</span>
          <input
            type="number"
            min={1}
            max={8}
            value={settings.vehicleCount}
            onChange={e => patch({ vehicleCount: clampIntField(e.target.value, 1, 8, settings.vehicleCount) })}
            disabled={busy}
          />
        </label>
        <label className="si-vrp-field">
          <span>Max stops / vehicle</span>
          <input
            type="number"
            min={1}
            max={50}
            value={settings.maxStopsPerVehicle}
            onChange={e =>
              patch({ maxStopsPerVehicle: clampIntField(e.target.value, 1, 50, settings.maxStopsPerVehicle) })
            }
            disabled={busy}
          />
        </label>
        <label className="si-vrp-field">
          <span>Capacity / vehicle</span>
          <input
            type="number"
            min={1}
            placeholder="Optional"
            value={settings.capacityPerVehicle ?? ''}
            onChange={e =>
              patch({
                capacityPerVehicle: e.target.value.trim()
                  ? clampIntField(e.target.value, 1, 9999, settings.capacityPerVehicle ?? 1)
                  : null,
              })
            }
            disabled={busy}
          />
        </label>
        <label className="si-vrp-field">
          <span>Max route time (min)</span>
          <input
            type="number"
            min={1}
            placeholder="Optional"
            value={settings.maxRouteTimeMinutes ?? ''}
            onChange={e =>
              patch({
                maxRouteTimeMinutes: e.target.value.trim()
                  ? clampIntField(e.target.value, 1, 1440, settings.maxRouteTimeMinutes ?? 60)
                  : null,
              })
            }
            disabled={busy}
          />
        </label>
      </div>

      <p className="si-route-map-panel__section-label">Optimization</p>
      <div className="si-route-map-panel__modes si-vrp-modes" role="group" aria-label="VRP optimization">
        <button
          type="button"
          className={`si-route-map-panel__mode${settings.optimizeGoal === 'minimize-time' ? ' is-active' : ''}`}
          disabled={busy}
          onClick={() => patch({ optimizeGoal: 'minimize-time' })}
        >
          <i className="fa-regular fa-clock" aria-hidden />
          <span>Min time</span>
        </button>
        <button
          type="button"
          className={`si-route-map-panel__mode${settings.optimizeGoal === 'minimize-distance' ? ' is-active' : ''}`}
          disabled={busy}
          onClick={() => patch({ optimizeGoal: 'minimize-distance' })}
        >
          <i className="fa-solid fa-ruler" aria-hidden />
          <span>Min distance</span>
        </button>
        <button
          type="button"
          className={`si-route-map-panel__mode${settings.routePattern === 'round-trip' ? ' is-active' : ''}`}
          disabled={busy}
          onClick={() => patch({ routePattern: 'round-trip' })}
        >
          <i className="fa-solid fa-rotate" aria-hidden />
          <span>Round trip</span>
        </button>
        <button
          type="button"
          className={`si-route-map-panel__mode${settings.routePattern === 'one-way' ? ' is-active' : ''}`}
          disabled={busy}
          onClick={() => patch({ routePattern: 'one-way' })}
        >
          <i className="fa-solid fa-arrow-right" aria-hidden />
          <span>One-way</span>
        </button>
      </div>

      <button
        type="button"
        className="si-route-map-panel__primary"
        disabled={busy || !hasOrsKey || !depotText.trim() || stopLines < 1}
        onClick={onCompute}
      >
        {busy ? (
          <>
            <i className="fa-solid fa-spinner fa-spin" aria-hidden />
            Optimizing routes…
          </>
        ) : (
          <>
            <i className="fa-solid fa-truck-fast" aria-hidden />
            Optimize VRP routes
          </>
        )}
      </button>

      {error ? <p className="si-route-map-panel__error">{error}</p> : null}

      {report ? (
        <div className="si-vrp-report">
          <div className="si-vrp-report__metrics">
            <div>
              <span>Total distance</span>
              <strong>{report.distanceLabel}</strong>
            </div>
            <div>
              <span>Total time</span>
              <strong>{report.durationLabel}</strong>
            </div>
            <div>
              <span>Stops served</span>
              <strong>{report.totalStops}</strong>
            </div>
            <div>
              <span>Avg utilization</span>
              <strong>{report.averageUtilizationPercent.toFixed(0)}%</strong>
            </div>
          </div>
          {report.unassignedStopIds.length > 0 ? (
            <p className="si-vrp-report__warn">
              {report.unassignedStopIds.length} stop(s) could not be assigned — relax constraints or add vehicles.
            </p>
          ) : null}
          {routes.filter(r => r.stopCount > 0).map(route => (
            <div key={route.vehicleId} className="si-vrp-route-row">
              <span className="si-vrp-route-row__dot" style={{ background: route.color }} aria-hidden />
              <span className="si-vrp-route-row__label">{route.vehicleLabel}</span>
              <span className="si-vrp-route-row__meta">
                {route.stopCount} stops · {Math.round(route.utilizationPercent)}% util
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
