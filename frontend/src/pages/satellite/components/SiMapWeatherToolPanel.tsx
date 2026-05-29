import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addSiMapSceneSlide,
  createSiMapSceneSlide,
  exportSiMapSceneSlidesJson,
  loadSiMapSceneSlides,
  removeSiMapSceneSlide,
  setActiveSiMapSceneSlide,
  type SiMapSceneSlidesStore,
} from '../utils/siMapSceneSlides';
import { clampFixedPanelPosition, siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout';
import type { SiMapCameraSnapshot } from '../utils/siMapProjectionTerrain';
import {
  DEFAULT_SI_MAP_WEATHER,
  SI_MAP_WEATHER_PRESETS,
  clampPct,
  type SiMapWeatherSettings,
} from '../utils/siMapWeatherTypes';
import './SiMapWeatherToolPanel.css';

const SI_WEATHER_PANEL_POS_LS = 'si-weather-panel-pos-v1';

type PanelPos = { left: number; top: number };

function rangeFillStyle(pct: number): CSSProperties {
  return { ['--si-range-fill' as string]: `${clampPct(pct)}%` };
}

/** Weather % sliders — same track widget shell as daylight `si-esri-slider__widget`. */
function WeatherPctSlider({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (pct: number) => void;
}) {
  return (
    <div className="si-weather-panel__slider-block">
      <label className="si-weather-panel__slider-label" htmlFor={id}>
        {label}
      </label>
      <div className="si-weather-panel__slider-row si-esri-slider__row">
        <div className="si-esri-slider__widget" role="group" aria-label={label}>
          <div className="si-esri-slider__track-wrap">
            <input
              id={id}
              type="range"
              min={0}
              max={100}
              value={value}
              onChange={e => onChange(clampPct(e.target.value))}
              className="si-weather-panel__range"
              style={rangeFillStyle(value)}
            />
          </div>
        </div>
        <span className="si-weather-panel__slider-val">{value}%</span>
      </div>
    </div>
  );
}

function defaultPanelPos(): PanelPos {
  return siMapLeftPopoutFixedPosition('weather', 380);
}

function readStoredPos(): PanelPos {
  if (typeof window === 'undefined') return defaultPanelPos();
  try {
    const raw = localStorage.getItem(SI_WEATHER_PANEL_POS_LS);
    if (!raw) return defaultPanelPos();
    const o = JSON.parse(raw) as { left?: unknown; top?: unknown };
    const left = Number(o.left);
    const top = Number(o.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      if (typeof window !== 'undefined' && left > window.innerWidth * 0.52) {
        return defaultPanelPos();
      }
      return { left, top };
    }
  } catch {
    /* ignore */
  }
  return defaultPanelPos();
}

function clampPos(left: number, top: number, w: number, h: number): PanelPos {
  return clampFixedPanelPosition(left, top, w, h);
}

export type SiMapWeatherToolPanelProps = {
  open: boolean;
  minimized: boolean;
  onMinimizedChange: (v: boolean) => void;
  onClose: () => void;
  settings: SiMapWeatherSettings;
  onSettingsChange: Dispatch<SetStateAction<SiMapWeatherSettings>>;
  readCamera: () => SiMapCameraSnapshot | null;
  basemapId?: string;
  onApplySlide: (slide: { camera: SiMapCameraSnapshot; weather: SiMapWeatherSettings; basemapId?: string }) => void;
};

export function SiMapWeatherToolPanel({
  open,
  minimized,
  onMinimizedChange,
  onClose,
  settings,
  onSettingsChange,
  readCamera,
  basemapId,
  onApplySlide,
}: SiMapWeatherToolPanelProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<PanelPos>(readStoredPos());
  const [pos, setPos] = useState<PanelPos>(posRef.current);
  const [dragging, setDragging] = useState(false);
  const dragRafRef = useRef<number | null>(null);
  const dragPendingRef = useRef<PanelPos | null>(null);
  const [slidesStore, setSlidesStore] = useState<SiMapSceneSlidesStore>(() => loadSiMapSceneSlides());

  const applyPanelPos = useCallback((next: PanelPos) => {
    posRef.current = next;
    const el = shellRef.current;
    if (el) {
      el.style.left = `${next.left}px`;
      el.style.top = `${next.top}px`;
    }
  }, []);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const patch = useCallback(
    (partial: Partial<SiMapWeatherSettings>) => {
      onSettingsChange(prev => ({ ...prev, ...partial }));
    },
    [onSettingsChange],
  );

  const measure = useCallback(() => {
    const el = shellRef.current;
    if (!el) return { width: 320, height: 400 };
    const r = el.getBoundingClientRect();
    return { width: r.width || 320, height: r.height || 400 };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const size = measure();
    setPos(prev => clampPos(prev.left, prev.top, size.width, size.height));
  }, [open, minimized, measure]);

  const persistPos = useCallback((p: PanelPos) => {
    try {
      localStorage.setItem(SI_WEATHER_PANEL_POS_LS, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const onDragHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, label, a, [role="slider"]')) return;

      e.preventDefault();
      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const start = { ...posRef.current, cx: e.clientX, cy: e.clientY };
      setDragging(true);

      const onMove = (ev: PointerEvent) => {
        const size = measure();
        dragPendingRef.current = clampPos(
          start.left + (ev.clientX - start.cx),
          start.top + (ev.clientY - start.cy),
          size.width,
          size.height,
        );
        if (dragRafRef.current != null) return;
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          const pending = dragPendingRef.current;
          if (pending) applyPanelPos(pending);
        });
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (dragRafRef.current != null) {
          window.cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        const size = measure();
        const last = dragPendingRef.current ?? posRef.current;
        const settled = clampPos(last.left, last.top, size.width, size.height);
        dragPendingRef.current = null;
        applyPanelPos(settled);
        setPos(settled);
        setDragging(false);
        persistPos(settled);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [applyPanelPos, measure, persistPos],
  );

  useEffect(
    () => () => {
      if (dragRafRef.current != null) window.cancelAnimationFrame(dragRafRef.current);
    },
    [],
  );

  const saveCurrentScene = () => {
    const camera = readCamera();
    if (!camera) return;
    const slide = createSiMapSceneSlide({
      camera,
      weather: settings,
      basemapId,
    });
    const store = addSiMapSceneSlide(slide);
    setSlidesStore(store);
  };

  const replaySlide = (id: string) => {
    const slide = slidesStore.slides.find(s => s.id === id);
    if (!slide) return;
    const store = setActiveSiMapSceneSlide(id);
    setSlidesStore(store);
    onApplySlide({
      camera: slide.camera,
      weather: slide.weather,
      basemapId: slide.basemapId,
    });
  };

  const exportSlides = () => {
    const json = exportSiMapSceneSlidesJson(slidesStore);
    void navigator.clipboard?.writeText(json);
  };

  const showPrecip = settings.preset === 'rain' || settings.preset === 'snow';
  const showFog = settings.preset === 'fog' || settings.preset === 'cloudy' || settings.preset === 'rain';
  const showSnowCover = settings.preset === 'snow' || settings.preset === 'cloudy';
  const isLightPanel = settings.panelTheme === 'light';

  const togglePanelTheme = () => {
    patch({ panelTheme: isLightPanel ? 'dark' : 'light' });
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={shellRef}
          className={
            'si-weather-panel' +
            (isLightPanel ? ' si-weather-panel--light' : '') +
            (minimized ? ' si-weather-panel--min' : '') +
            (dragging ? ' si-weather-panel--dragging' : '')
          }
          style={{ left: pos.left, top: pos.top }}
          role="dialog"
          aria-label="Weather visualization"
          initial={{ opacity: 0, x: -24, scale: 0.98 }}
          animate={dragging ? { opacity: 1, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -20, scale: 0.98 }}
          transition={{ duration: dragging ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="si-weather-panel__head">
            <div
              className="si-weather-panel__head-row"
              onPointerDown={onDragHandlePointerDown}
              title="Drag to move"
            >
              <div className="si-weather-panel__brand">
                <i className="fa-solid fa-cloud-sun-rain" aria-hidden />
                <h2 className="si-weather-panel__title">Weather visualization</h2>
              </div>
              <div className="si-weather-panel__head-actions">
                <button
                  type="button"
                  className="si-weather-panel__theme-toggle"
                  onClick={togglePanelTheme}
                  aria-label={isLightPanel ? 'Switch to dark glass theme' : 'Switch to light glass theme'}
                  title={isLightPanel ? 'Dark glass theme' : 'Light glass theme'}
                >
                  <i className={`fa-solid ${isLightPanel ? 'fa-moon' : 'fa-sun'}`} aria-hidden />
                </button>
                <span className="si-weather-panel__head-actions-divider" aria-hidden />
                <button
                  type="button"
                  className="si-weather-panel__icon-btn"
                  onClick={() => onMinimizedChange(!minimized)}
                  aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
                >
                  <i className={`fa-solid ${minimized ? 'fa-up-right-and-down-left-from-center' : 'fa-window-minimize'}`} />
                </button>
                <button type="button" className="si-weather-panel__icon-btn" onClick={onClose} aria-label="Close weather panel">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
          </header>

          {!minimized ? (
            <div className="si-weather-panel__body">
              <div className="si-weather-panel__presets" role="group" aria-label="Weather preset">
                    {SI_MAP_WEATHER_PRESETS.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`si-weather-panel__preset${settings.preset === p.id ? ' is-active' : ''}`}
                        title={p.label}
                        onClick={() => {
                          const next: Partial<SiMapWeatherSettings> = { preset: p.id };
                          if (p.id === 'snow' && !settings.snowCover) next.snowCover = true;
                          onSettingsChange({ ...settings, ...next });
                        }}
                      >
                        <i className={`fa-solid ${p.icon}`} aria-hidden />
                      </button>
                    ))}
                  </div>

                  <WeatherPctSlider
                    id="si-weather-cloud"
                    label="Cloud cover"
                    value={settings.cloudCover}
                    onChange={cloudCover => patch({ cloudCover })}
                  />

                  {showPrecip ? (
                    <WeatherPctSlider
                      id="si-weather-precip"
                      label="Precipitation"
                      value={settings.precipitation}
                      onChange={precipitation => patch({ precipitation })}
                    />
                  ) : null}

                  {showFog ? (
                    <WeatherPctSlider
                      id="si-weather-fog"
                      label="Fog density"
                      value={settings.fogDensity}
                      onChange={fogDensity => patch({ fogDensity })}
                    />
                  ) : null}

                  {showSnowCover ? (
                    <label className="si-weather-panel__check">
                      <input
                        type="checkbox"
                        checked={settings.snowCover}
                        onChange={e => patch({ snowCover: e.target.checked })}
                      />
                      <span>Snow cover on 3D surfaces</span>
                    </label>
                  ) : null}

              <div className="si-weather-panel__slides">
                <div className="si-weather-panel__slides-head">
                  <span>Scene slides</span>
                  <div className="si-weather-panel__slides-actions">
                    <button type="button" className="si-weather-panel__link-btn" onClick={saveCurrentScene}>
                      Save view
                    </button>
                    <button type="button" className="si-weather-panel__link-btn" onClick={exportSlides} title="Copy JSON to clipboard">
                      Share
                    </button>
                  </div>
                </div>
                {slidesStore.slides.length === 0 ? (
                  <p className="si-weather-panel__hint">Save the current camera and weather to replay or share slides.</p>
                ) : (
                  <ul className="si-weather-panel__slide-list">
                    {slidesStore.slides.map(sl => (
                      <li key={sl.id}>
                        <button
                          type="button"
                          className={`si-weather-panel__slide-btn${
                            slidesStore.activeSlideId === sl.id ? ' is-active' : ''
                          }`}
                          onClick={() => replaySlide(sl.id)}
                        >
                          <strong>{sl.title}</strong>
                          <span>{sl.weather.preset}</span>
                        </button>
                        <button
                          type="button"
                          className="si-weather-panel__slide-del"
                          aria-label={`Remove ${sl.title}`}
                          onClick={() => setSlidesStore(removeSiMapSceneSlide(sl.id))}
                        >
                          <i className="fa-solid fa-trash-can" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                className="si-weather-panel__reset"
                onClick={() =>
                  onSettingsChange({
                    ...DEFAULT_SI_MAP_WEATHER,
                    panelTheme: settings.panelTheme,
                    daylightMinutes: settings.daylightMinutes,
                    daylightDate: settings.daylightDate,
                    sunPositionByDateTime: settings.sunPositionByDateTime,
                    daylightShadows: settings.daylightShadows,
                    daylightTimePlaying: false,
                    daylightDatePlaying: false,
                    rainFlowEnabled: false,
                    rainFlowPlaying: false,
                  })
                }
              >
                Reset weather
              </button>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
