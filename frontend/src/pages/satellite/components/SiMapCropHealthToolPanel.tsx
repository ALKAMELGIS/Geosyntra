import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { clampFixedPanelPosition, siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout';
import {
  DEFAULT_SI_CROP_HEALTH_SETTINGS,
  SI_CROP_HEALTH_CONDITION_META,
  SI_CROP_TYPE_OPTIONS,
  type SiCropHealthAnalysisResult,
  type SiCropHealthSettings,
} from '../utils/siCropHealthTypes';
import './SiMapCropHealthToolPanel.css';

const SI_CROP_HEALTH_PANEL_POS_LS = 'si-crop-health-panel-pos-v1';

type PanelPos = { left: number; top: number };

function defaultPanelPos(): PanelPos {
  return siMapLeftPopoutFixedPosition('crop-health', 420);
}

function readStoredPos(): PanelPos {
  if (typeof window === 'undefined') return defaultPanelPos();
  try {
    const raw = localStorage.getItem(SI_CROP_HEALTH_PANEL_POS_LS);
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

export type SiMapCropHealthToolPanelProps = {
  open: boolean;
  minimized: boolean;
  onMinimizedChange: (v: boolean) => void;
  onClose: () => void;
  settings: SiCropHealthSettings;
  onSettingsChange: (next: SiCropHealthSettings) => void;
  aoiOptions: Array<{ id: string; name: string }>;
  hasAoi: boolean;
  running: boolean;
  statusText: string;
  errorText: string | null;
  result: SiCropHealthAnalysisResult | null;
  onRunAnalysis: () => void;
};

export function SiMapCropHealthToolPanel({
  open,
  minimized,
  onMinimizedChange,
  onClose,
  settings,
  onSettingsChange,
  aoiOptions,
  hasAoi,
  running,
  statusText,
  errorText,
  result,
  onRunAnalysis,
}: SiMapCropHealthToolPanelProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<PanelPos>(readStoredPos());
  const [pos, setPos] = useState<PanelPos>(posRef.current);
  const [dragging, setDragging] = useState(false);

  const patch = useCallback(
    (partial: Partial<SiCropHealthSettings>) => onSettingsChange({ ...settings, ...partial }),
    [onSettingsChange, settings],
  );

  const measure = useCallback(() => {
    const el = shellRef.current;
    if (!el) return { width: 320, height: 420 };
    const r = el.getBoundingClientRect();
    return { width: r.width || 320, height: r.height || 420 };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const size = measure();
    setPos(prev => clampFixedPanelPosition(prev.left, prev.top, size.width, size.height));
  }, [open, minimized, measure, result]);

  const persistPos = useCallback((p: PanelPos) => {
    try {
      localStorage.setItem(SI_CROP_HEALTH_PANEL_POS_LS, JSON.stringify(p));
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
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [measure, persistPos],
  );

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={shellRef}
          className={
            'si-crop-health-panel' +
            (minimized ? ' si-crop-health-panel--min' : '') +
            (dragging ? ' si-crop-health-panel--dragging' : '')
          }
          style={{ left: pos.left, top: pos.top }}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-label="Crop Health Intelligence"
        >
          <header className="si-crop-health-panel__head" onPointerDown={onDragHandlePointerDown}>
            <div className="si-crop-health-panel__head-row">
              <div className="si-crop-health-panel__brand">
                <i className="fa-solid fa-seedling" aria-hidden />
                <div>
                  <h2 className="si-crop-health-panel__title">Crop Health Intelligence</h2>
                  <p className="si-crop-health-panel__sub">NDVI · EVI · SAVI + GeoAI disease risk</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="si-crop-health-panel__icon-btn"
                  onClick={() => onMinimizedChange(!minimized)}
                  aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
                >
                  <i className={`fa-solid fa-${minimized ? 'chevron-down' : 'minus'}`} aria-hidden />
                </button>
                <button type="button" className="si-crop-health-panel__icon-btn" onClick={onClose} aria-label="Close">
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            </div>
          </header>

          {!minimized ? (
            <div className="si-crop-health-panel__body">
              <div className="si-crop-health-panel__field">
                <label htmlFor="si-chi-aoi">AOI</label>
                <select
                  id="si-chi-aoi"
                  value={settings.aoiId || aoiOptions[0]?.id || ''}
                  onChange={e => patch({ aoiId: e.target.value })}
                >
                  {aoiOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="si-crop-health-panel__field">
                <label htmlFor="si-chi-crop">Crop type</label>
                <select
                  id="si-chi-crop"
                  value={settings.cropType}
                  onChange={e => patch({ cropType: e.target.value as SiCropHealthSettings['cropType'] })}
                >
                  {SI_CROP_TYPE_OPTIONS.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="si-crop-health-panel__toggles">
                <div className="si-crop-health-panel__toggle">
                  <label htmlFor="si-chi-ndvi">NDVI analysis (temporal stacking)</label>
                  <input
                    id="si-chi-ndvi"
                    type="checkbox"
                    checked={settings.ndviAnalysisEnabled}
                    onChange={e => patch({ ndviAnalysisEnabled: e.target.checked })}
                  />
                </div>
                <div className="si-crop-health-panel__toggle">
                  <label htmlFor="si-chi-ai">AI disease detection</label>
                  <input
                    id="si-chi-ai"
                    type="checkbox"
                    checked={settings.aiDiseaseEnabled}
                    onChange={e => patch({ aiDiseaseEnabled: e.target.checked })}
                  />
                </div>
                <div className="si-crop-health-panel__toggle">
                  <label htmlFor="si-chi-wx">Weather API (Open-Meteo)</label>
                  <input
                    id="si-chi-wx"
                    type="checkbox"
                    checked={settings.useWeatherApi}
                    onChange={e => patch({ useWeatherApi: e.target.checked })}
                  />
                </div>
                <div className="si-crop-health-panel__toggle">
                  <label htmlFor="si-chi-sm">Soil moisture (NDMI index)</label>
                  <input
                    id="si-chi-sm"
                    type="checkbox"
                    checked={settings.useSoilMoistureIndex}
                    onChange={e => patch({ useSoilMoistureIndex: e.target.checked })}
                  />
                </div>
              </div>

              {!settings.useWeatherApi ? (
                <div className="si-crop-health-panel__grid2">
                  <div className="si-crop-health-panel__field">
                    <label htmlFor="si-chi-temp">Temp °C</label>
                    <input
                      id="si-chi-temp"
                      type="number"
                      value={settings.temperatureC}
                      onChange={e => patch({ temperatureC: Number(e.target.value) })}
                    />
                  </div>
                  <div className="si-crop-health-panel__field">
                    <label htmlFor="si-chi-hum">Humidity %</label>
                    <input
                      id="si-chi-hum"
                      type="number"
                      value={settings.humidityPct}
                      onChange={e => patch({ humidityPct: Number(e.target.value) })}
                    />
                  </div>
                  <div className="si-crop-health-panel__field">
                    <label htmlFor="si-chi-rain">Rain mm/wk</label>
                    <input
                      id="si-chi-rain"
                      type="number"
                      value={settings.rainfallMmWeek}
                      onChange={e => patch({ rainfallMmWeek: Number(e.target.value) })}
                    />
                  </div>
                  <div className="si-crop-health-panel__field">
                    <label htmlFor="si-chi-soil">Soil moisture %</label>
                    <input
                      id="si-chi-soil"
                      type="number"
                      value={settings.soilMoisturePct}
                      onChange={e => patch({ soilMoisturePct: Number(e.target.value) })}
                    />
                  </div>
                </div>
              ) : null}

              <div className="si-crop-health-panel__toggles">
                <div className="si-crop-health-panel__toggle">
                  <label htmlFor="si-chi-health">Crop health layer</label>
                  <input
                    id="si-chi-health"
                    type="checkbox"
                    checked={settings.showHealthLayer}
                    onChange={e => patch({ showHealthLayer: e.target.checked })}
                  />
                </div>
                <div className="si-crop-health-panel__toggle">
                  <label htmlFor="si-chi-risk">Disease risk layer</label>
                  <input
                    id="si-chi-risk"
                    type="checkbox"
                    checked={settings.showDiseaseRiskLayer}
                    onChange={e => patch({ showDiseaseRiskLayer: e.target.checked })}
                  />
                </div>
                <div className="si-crop-health-panel__toggle">
                  <label htmlFor="si-chi-hot">Hotspots on map</label>
                  <input
                    id="si-chi-hot"
                    type="checkbox"
                    checked={settings.showHotspots}
                    onChange={e => patch({ showHotspots: e.target.checked })}
                  />
                </div>
              </div>

              <div className="si-crop-health-panel__field">
                <label htmlFor="si-chi-op">Layer opacity</label>
                <input
                  id="si-chi-op"
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round(settings.healthOpacity * 100)}
                  onChange={e => patch({ healthOpacity: Number(e.target.value) / 100 })}
                />
              </div>

              <button
                type="button"
                className="si-crop-health-panel__run"
                disabled={!hasAoi || running}
                onClick={onRunAnalysis}
              >
                {running ? 'Analyzing AOI…' : 'Run analysis'}
              </button>

              <p className={`si-crop-health-panel__status${errorText ? ' si-crop-health-panel__status--err' : ''}`}>
                {errorText ?? statusText}
              </p>

              {result ? (
                <div className="si-crop-health-panel__results">
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
                    {result.modelLabel} · {result.cellCount} cells · {result.areaHa.toFixed(1)} ha
                  </p>
                  <div className="si-crop-health-panel__summary">
                    {(Object.keys(SI_CROP_HEALTH_CONDITION_META) as Array<keyof typeof SI_CROP_HEALTH_CONDITION_META>).map(
                      k => (
                        <div key={k} className="si-crop-health-panel__chip">
                          <strong style={{ color: SI_CROP_HEALTH_CONDITION_META[k].color }}>
                            {result.summary[k].pct.toFixed(0)}%
                          </strong>
                          {SI_CROP_HEALTH_CONDITION_META[k].label}
                        </div>
                      ),
                    )}
                  </div>
                  {result.trend.length > 1 ? (
                    <div className="si-crop-health-panel__trend" aria-hidden>
                      {result.trend.map(t => (
                        <div
                          key={t.weekEndIso}
                          className="si-crop-health-panel__trend-bar"
                          style={{
                            height: `${Math.max(8, Math.min(100, (t.meanNdvi + 0.2) * 80))}%`,
                            opacity: 0.35 + (t.stressPct / 100) * 0.65,
                          }}
                          title={`${t.weekEndIso} NDVI ${t.meanNdvi.toFixed(2)}`}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="si-crop-health-panel__legend">
                    {(Object.keys(SI_CROP_HEALTH_CONDITION_META) as Array<keyof typeof SI_CROP_HEALTH_CONDITION_META>).map(
                      k => (
                        <span key={k}>
                          <i style={{ background: SI_CROP_HEALTH_CONDITION_META[k].color }} />
                          {SI_CROP_HEALTH_CONDITION_META[k].label}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
