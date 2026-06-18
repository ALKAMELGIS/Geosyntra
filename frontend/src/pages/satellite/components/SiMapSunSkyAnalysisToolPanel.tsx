import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { clampFixedPanelPosition, siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout';
import { SiMapDaylightPanel } from './SiMapDaylightPanel';
import type { SiMapWeatherSettings } from '../utils/siMapWeatherTypes';
import {
  analyzeSunLineOfSight,
  assessRooftopSolarPotential,
  buildSiMapSunSkySnapshot,
  computeSolsticeComparison,
  yearFromIsoDate,
} from '../utils/siMapSunSkyAnalysis';
import type { SiMapSunSkyAnalysisTab, SiMapSunSkySettings } from '../utils/siMapSunSkyTypes';
import './SiMapSunSkyAnalysisToolPanel.css';

const SI_SUN_SKY_PANEL_POS_LS = 'si-sun-sky-panel-pos-v1';

type PanelPos = { left: number; top: number };

const TABS: { id: SiMapSunSkyAnalysisTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'fa-compass' },
  { id: 'sky', label: 'Sky & Time', icon: 'fa-cloud-sun' },
  { id: 'shadows', label: 'Shadows', icon: 'fa-mountain-sun' },
  { id: 'analysis', label: 'Analysis', icon: 'fa-solar-panel' },
];

function defaultPanelPos(): PanelPos {
  return siMapLeftPopoutFixedPosition('sun-sky', 440);
}

function readStoredPos(): PanelPos {
  if (typeof window === 'undefined') return defaultPanelPos();
  try {
    const raw = localStorage.getItem(SI_SUN_SKY_PANEL_POS_LS);
    if (!raw) return defaultPanelPos();
    const o = JSON.parse(raw) as { left?: unknown; top?: unknown };
    const left = Number(o.left);
    const top = Number(o.top);
    if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
  } catch {
    /* ignore */
  }
  return defaultPanelPos();
}

export type SiMapSunSkyAnalysisToolPanelProps = {
  open: boolean;
  minimized: boolean;
  onMinimizedChange: (v: boolean) => void;
  onClose: () => void;
  settings: SiMapSunSkySettings;
  onSettingsChange: (next: SiMapSunSkySettings) => void;
  weather: SiMapWeatherSettings;
  onWeatherPatch: (partial: Partial<SiMapWeatherSettings>) => void;
  mapCenter: { lng: number; lat: number };
  losSketchMode: 'observer' | 'target' | null;
  onLosSketchModeChange: (mode: 'observer' | 'target' | null) => void;
  onClearLos: () => void;
};

export function SiMapSunSkyAnalysisToolPanel({
  open,
  minimized,
  onMinimizedChange,
  onClose,
  settings,
  onSettingsChange,
  weather,
  onWeatherPatch,
  mapCenter,
  losSketchMode,
  onLosSketchModeChange,
  onClearLos,
}: SiMapSunSkyAnalysisToolPanelProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<PanelPos>(readStoredPos());
  const [pos, setPos] = useState<PanelPos>(posRef.current);
  const [dragging, setDragging] = useState(false);

  const patch = useCallback(
    (partial: Partial<SiMapSunSkySettings>) => onSettingsChange({ ...settings, ...partial }),
    [onSettingsChange, settings],
  );

  const snapshot = useMemo(
    () =>
      buildSiMapSunSkySnapshot(
        weather.daylightMinutes,
        weather.daylightDate,
        mapCenter.lat,
        mapCenter.lng,
      ),
    [weather.daylightMinutes, weather.daylightDate, mapCenter.lat, mapCenter.lng],
  );

  const solstice = useMemo(
    () =>
      computeSolsticeComparison(
        weather.daylightMinutes,
        yearFromIsoDate(weather.daylightDate),
        mapCenter.lat,
      ),
    [weather.daylightMinutes, weather.daylightDate, mapCenter.lat],
  );

  const rooftop = useMemo(
    () => assessRooftopSolarPotential(snapshot, settings.rooftopAreaM2, settings.panelDensityWm2),
    [snapshot, settings.rooftopAreaM2, settings.panelDensityWm2],
  );

  const losResult = useMemo(() => {
    if (!settings.losObserver || !settings.losTarget) return null;
    return analyzeSunLineOfSight(settings.losObserver, settings.losTarget, snapshot.sun);
  }, [settings.losObserver, settings.losTarget, snapshot.sun]);

  const measure = useCallback(() => {
    const el = shellRef.current;
    if (!el) return { width: 360, height: 480 };
    const r = el.getBoundingClientRect();
    return { width: r.width || 360, height: r.height || 480 };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const size = measure();
    setPos(prev => clampFixedPanelPosition(prev.left, prev.top, size.width, size.height));
  }, [open, minimized, measure, settings.activeTab]);

  const persistPos = useCallback((p: PanelPos) => {
    try {
      localStorage.setItem(SI_SUN_SKY_PANEL_POS_LS, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const onDragHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, label, a, select')) return;
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { ...posRef.current };
      const onMove = (ev: PointerEvent) => {
        const size = measure();
        const next = clampFixedPanelPosition(
          start.left + (ev.clientX - startX),
          start.top + (ev.clientY - startY),
          size.width,
          size.height,
        );
        posRef.current = next;
        setPos(next);
      };
      const onUp = () => {
        setDragging(false);
        persistPos(posRef.current);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [measure, persistPos],
  );

  useEffect(() => {
    if (!open) return;
    onWeatherPatch({
      sunPositionByDateTime: true,
      daylightShadows: settings.buildingShadows,
    });
  }, [open, settings.buildingShadows, onWeatherPatch]);

  const primaryEvents = snapshot.events.filter(e =>
    ['sunrise', 'solarNoon', 'sunset', 'goldenHourMorningStart', 'goldenHourEveningStart', 'blueHourMorningStart', 'blueHourEveningStart'].includes(
      e.kind,
    ),
  );

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={shellRef}
          className={`si-sun-sky-panel${minimized ? ' si-sun-sky-panel--min' : ''}${dragging ? ' is-dragging' : ''}`}
          style={{ left: pos.left, top: pos.top }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          role="dialog"
          aria-label="Sun and Sky Analysis"
        >
          <header
            className="si-sun-sky-panel__head"
            onPointerDown={onDragHandlePointerDown}
          >
            <div className="si-sun-sky-panel__title">
              <i className="fa-solid fa-sun" aria-hidden />
              <span>Sun &amp; Sky Analysis</span>
            </div>
            <div className="si-sun-sky-panel__actions">
              <button
                type="button"
                className="si-sun-sky-panel__icon-btn"
                onClick={() => onMinimizedChange(!minimized)}
                aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
              >
                <i className={`fa-solid ${minimized ? 'fa-window-maximize' : 'fa-window-minimize'}`} aria-hidden />
              </button>
              <button type="button" className="si-sun-sky-panel__icon-btn" onClick={onClose} aria-label="Close">
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </div>
          </header>

          {!minimized ? (
            <>
              <nav className="si-sun-sky-panel__tabs" role="tablist">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={settings.activeTab === tab.id}
                    className={
                      'si-sun-sky-panel__tab' +
                      (settings.activeTab === tab.id ? ' si-sun-sky-panel__tab--active' : '')
                    }
                    onClick={() => patch({ activeTab: tab.id })}
                  >
                    <i className={`fa-solid ${tab.icon}`} aria-hidden />
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className="si-sun-sky-panel__body">
                {settings.activeTab === 'overview' ? (
                  <>
                    <div className="si-sun-sky-panel__metrics">
                      <div className="si-sun-sky-panel__metric">
                        <span className="si-sun-sky-panel__metric-label">Azimuth</span>
                        <strong>{snapshot.azimuthLabel}</strong>
                      </div>
                      <div className="si-sun-sky-panel__metric">
                        <span className="si-sun-sky-panel__metric-label">Elevation</span>
                        <strong>{snapshot.elevationLabel}</strong>
                      </div>
                      <div className="si-sun-sky-panel__metric">
                        <span className="si-sun-sky-panel__metric-label">Clear-sky GHI</span>
                        <strong>{Math.round(snapshot.clearSkyGhiWm2)} W/m²</strong>
                      </div>
                      <div className="si-sun-sky-panel__metric">
                        <span className="si-sun-sky-panel__metric-label">Exposure</span>
                        <strong>
                          {snapshot.exposureScore}% · {snapshot.exposureLabel}
                        </strong>
                      </div>
                    </div>

                    <section className="si-sun-sky-panel__section">
                      <h3>Solar events</h3>
                      <ul className="si-sun-sky-panel__events">
                        {primaryEvents.map(ev => (
                          <li key={ev.kind}>
                            <span>{ev.label}</span>
                            <button
                              type="button"
                              className="si-sun-sky-panel__event-time"
                              disabled={ev.minutes == null}
                              onClick={() =>
                                ev.minutes != null && onWeatherPatch({ daylightMinutes: ev.minutes })
                              }
                              title="Jump to this time"
                            >
                              {ev.timeLabel}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="si-sun-sky-panel__section">
                      <h3>Irradiance</h3>
                      <div className="si-sun-sky-panel__irr">
                        <span>DNI {Math.round(snapshot.directNormalIrradianceWm2)} W/m²</span>
                        <span>DHI {Math.round(snapshot.diffuseHorizontalWm2)} W/m²</span>
                      </div>
                    </section>
                  </>
                ) : null}

                {settings.activeTab === 'sky' ? (
                  <SiMapDaylightPanel
                    settings={weather}
                    onPatch={onWeatherPatch}
                    isLightTheme={false}
                  />
                ) : null}

                {settings.activeTab === 'shadows' ? (
                  <>
                    <div className="si-sun-sky-panel__checks">
                      <label className="si-sun-sky-panel__check">
                        <input
                          type="checkbox"
                          checked={settings.terrainShadows}
                          onChange={e => patch({ terrainShadows: e.target.checked })}
                        />
                        <span>Terrain shadow analysis (DEM hillshade)</span>
                      </label>
                      <label className="si-sun-sky-panel__check">
                        <input
                          type="checkbox"
                          checked={settings.buildingShadows}
                          onChange={e => {
                            patch({ buildingShadows: e.target.checked });
                            onWeatherPatch({ daylightShadows: e.target.checked });
                          }}
                        />
                        <span>Building shadow analysis (3D extrusions)</span>
                      </label>
                      <label className="si-sun-sky-panel__check">
                        <input
                          type="checkbox"
                          checked={settings.showSunPosition}
                          onChange={e => patch({ showSunPosition: e.target.checked })}
                        />
                        <span>Sun position visualization</span>
                      </label>
                      <label className="si-sun-sky-panel__check">
                        <input
                          type="checkbox"
                          checked={settings.showSolarPath}
                          onChange={e => patch({ showSolarPath: e.target.checked })}
                        />
                        <span>Solar path arc</span>
                      </label>
                    </div>

                    <section className="si-sun-sky-panel__section">
                      <h3>Seasonal comparison</h3>
                      <div className="si-sun-sky-panel__season-btns">
                        {(
                          [
                            ['off', 'Off'],
                            ['summer', 'Summer solstice'],
                            ['winter', 'Winter solstice'],
                            ['compare', 'Compare both'],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={
                              'si-sun-sky-panel__season-btn' +
                              (settings.seasonalMode === id ? ' is-active' : '')
                            }
                            onClick={() => patch({ seasonalMode: id })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {settings.seasonalMode !== 'off' ? (
                        <div className="si-sun-sky-panel__solstice">
                          <div>
                            <span className="si-sun-sky-panel__solstice-tag si-sun-sky-panel__solstice-tag--summer">
                              Jun 21
                            </span>
                            {solstice.summer.elevationDeg.toFixed(1)}° · {Math.round(solstice.summerGhi)} W/m²
                          </div>
                          <div>
                            <span className="si-sun-sky-panel__solstice-tag si-sun-sky-panel__solstice-tag--winter">
                              Dec 21
                            </span>
                            {solstice.winter.elevationDeg.toFixed(1)}° · {Math.round(solstice.winterGhi)} W/m²
                          </div>
                        </div>
                      ) : null}
                    </section>
                  </>
                ) : null}

                {settings.activeTab === 'analysis' ? (
                  <>
                    <section className="si-sun-sky-panel__section">
                      <h3>Solar exposure</h3>
                      <div className="si-sun-sky-panel__exposure-bar">
                        <div
                          className="si-sun-sky-panel__exposure-fill"
                          style={{ width: `${snapshot.exposureScore}%` }}
                        />
                      </div>
                      <p className="si-sun-sky-panel__hint">
                        Score combines current sun elevation and day length at {mapCenter.lat.toFixed(4)}°N.
                      </p>
                    </section>

                    <section className="si-sun-sky-panel__section">
                      <h3>Rooftop solar potential</h3>
                      <label className="si-sun-sky-panel__field">
                        Roof area (m²)
                        <input
                          type="number"
                          min={10}
                          max={50000}
                          value={settings.rooftopAreaM2}
                          onChange={e => patch({ rooftopAreaM2: Number(e.target.value) || 120 })}
                        />
                      </label>
                      <label className="si-sun-sky-panel__field">
                        Panel density (W/m²)
                        <input
                          type="number"
                          min={80}
                          max={350}
                          value={settings.panelDensityWm2}
                          onChange={e => patch({ panelDensityWm2: Number(e.target.value) || 180 })}
                        />
                      </label>
                      <div className="si-sun-sky-panel__metrics si-sun-sky-panel__metrics--compact">
                        <div className="si-sun-sky-panel__metric">
                          <span className="si-sun-sky-panel__metric-label">Peak capacity</span>
                          <strong>{rooftop.peakCapacityKw} kW</strong>
                        </div>
                        <div className="si-sun-sky-panel__metric">
                          <span className="si-sun-sky-panel__metric-label">Est. annual yield</span>
                          <strong>{rooftop.annualYieldKwh.toLocaleString()} kWh</strong>
                        </div>
                        <div className="si-sun-sky-panel__metric">
                          <span className="si-sun-sky-panel__metric-label">Suitability</span>
                          <strong className={`si-sun-sky-panel__suit si-sun-sky-panel__suit--${rooftop.suitability}`}>
                            {rooftop.suitability}
                          </strong>
                        </div>
                      </div>
                    </section>

                    <section className="si-sun-sky-panel__section">
                      <h3>Line of sight (sun context)</h3>
                      <p className="si-sun-sky-panel__hint">
                        Click the map to place observer and target points.
                      </p>
                      <div className="si-sun-sky-panel__los-btns">
                        <button
                          type="button"
                          className={
                            'si-sun-sky-panel__los-btn' +
                            (losSketchMode === 'observer' ? ' is-active' : '')
                          }
                          onClick={() =>
                            onLosSketchModeChange(losSketchMode === 'observer' ? null : 'observer')
                          }
                        >
                          Set observer
                        </button>
                        <button
                          type="button"
                          className={
                            'si-sun-sky-panel__los-btn' +
                            (losSketchMode === 'target' ? ' is-active' : '')
                          }
                          onClick={() =>
                            onLosSketchModeChange(losSketchMode === 'target' ? null : 'target')
                          }
                        >
                          Set target
                        </button>
                        <button type="button" className="si-sun-sky-panel__los-btn" onClick={onClearLos}>
                          Clear
                        </button>
                      </div>
                      {losResult ? (
                        <div className="si-sun-sky-panel__los-result">
                          <p>{losResult.message}</p>
                          <ul>
                            <li>Distance: {(losResult.distanceM / 1000).toFixed(2)} km</li>
                            <li>Terrain clear: {losResult.terrainClear ? 'Yes' : 'No'}</li>
                            <li>Target illuminated: {losResult.targetIlluminated ? 'Yes' : 'No'}</li>
                          </ul>
                        </div>
                      ) : null}
                    </section>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
