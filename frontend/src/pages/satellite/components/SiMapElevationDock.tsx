import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  SiContourClassificationMode,
  SiContourColorTheme,
  SiMapTerrainSettings,
} from '../utils/siMapProjectionTerrain';
import {
  SI_CONTOUR_INTERVAL_MAX,
  SI_CONTOUR_INTERVAL_MIN,
  SI_CONTOUR_LABEL_SIZE_MAX,
  SI_CONTOUR_LABEL_SIZE_MIN,
  SI_CONTOUR_LINE_WIDTH_MAX,
  SI_CONTOUR_LINE_WIDTH_MIN,
  SI_CONTOUR_MAIN_LINE_EVERY_MAX,
  SI_CONTOUR_MAIN_LINE_EVERY_MIN,
  SI_TERRAIN_EXAGGERATION_MAX,
  SI_TERRAIN_EXAGGERATION_MIN,
  clampContourLabelSize,
  clampContourLineWidth,
  normalizeContourLabelColor,
  normalizeContourLineColor,
  siContourThemePatch,
} from '../utils/siMapProjectionTerrain';
import {
  clampFixedPanelPosition,
  isFixedPanelInMapCanvas,
  siMapNorthPopoutFixedPosition,
} from '../utils/siMapFloatingPanelLayout';
import './SiMapDaylightArcSlider.css';
import './SiMapElevationDock.css';

const SI_TERRAIN_PANEL_POS_LS = 'si-terrain-panel-pos-v5';
const TERRAIN_PANEL_W = 248;
const TERRAIN_PANEL_H = 380;

const CONTOUR_CLASSIFICATION_MODES: Array<{
  id: SiContourClassificationMode;
  label: string;
  hint: string;
}> = [
  { id: 'elevation', label: 'Elev', hint: 'Height bands' },
  { id: 'density', label: 'Density', hint: 'Relief concentration' },
  { id: 'gradient', label: 'Grad', hint: 'Smooth ramp' },
];

function clampContourMainLineEveryInput(n: number): number {
  return Math.min(SI_CONTOUR_MAIN_LINE_EVERY_MAX, Math.max(SI_CONTOUR_MAIN_LINE_EVERY_MIN, Math.round(n)));
}

function ElevGroup({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="si-elev-group" aria-label={title}>
      <button
        type="button"
        className={'si-elev-group__head' + (open ? ' si-elev-group__head--open' : '')}
        onClick={onToggle}
        aria-expanded={open}
      >
        {icon ? <i className={icon} aria-hidden /> : null}
        <span>{title}</span>
        <i className={'fa-solid fa-chevron-' + (open ? 'up' : 'down') + ' si-elev-group__chevron'} aria-hidden />
      </button>
      {open ? <div className="si-elev-group__body">{children}</div> : null}
    </section>
  );
}

function ElevChip({
  checked,
  disabled,
  label,
  onChange,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <label className={'si-elev-chip' + (checked ? ' si-elev-chip--on' : '')} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

type PanelPos = { left: number; top: number };

export type SiMapElevationDockProps = {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  settings: SiMapTerrainSettings;
  onSettingsChange: (patch: Partial<SiMapTerrainSettings>) => void;
};

function pct(min: number, max: number, value: number): number {
  return Math.round(((value - min) / (max - min)) * 100);
}

function rangeFillPct(min: number, max: number, value: number): CSSProperties {
  const p = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return { ['--si-range-fill' as string]: `${p}%` };
}

function clampContourIntervalInput(n: number): number {
  return Math.min(SI_CONTOUR_INTERVAL_MAX, Math.max(SI_CONTOUR_INTERVAL_MIN, Math.round(n)));
}

function toColorInputHex(raw: string | undefined, fallback: string): string {
  const h = (raw || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h;
  if (/^#[0-9A-Fa-f]{3}$/.test(h)) {
    const r = h[1]!;
    const g = h[2]!;
    const b = h[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function TerrainRangeTrack({
  id,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
  ariaLabel,
}: {
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="si-map-elevation-dock__slider-row si-esri-slider__row">
      <div className="si-esri-slider__widget" role="group" aria-label={ariaLabel}>
        <div className="si-esri-slider__track-wrap">
          <input
            id={id}
            type="range"
            className="si-map-elevation-dock__range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            style={rangeFillPct(min, max, value)}
            onChange={e => onChange(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

/** Interval slider + compact numeric field (meters). */
function TerrainContourIntervalControl({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (contourIntervalM: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = () => {
    const parsed = parseInt(draft, 10);
    const next = Number.isFinite(parsed) ? clampContourIntervalInput(parsed) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="si-map-elevation-dock__row si-map-elevation-dock__row--interval">
      <div className="si-map-elevation-dock__interval-head">
        <span className="si-map-elevation-dock__label">Interval</span>
        <div className="si-map-elevation-dock__interval-input-wrap">
          <input
            type="text"
            inputMode="numeric"
            className="si-map-elevation-dock__num-input"
            value={draft}
            disabled={disabled}
            aria-label="Contour interval in meters"
            onChange={e => setDraft(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={commitDraft}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <span className="si-map-elevation-dock__unit">m</span>
        </div>
      </div>
      <TerrainRangeTrack
        id="si-terrain-contour-interval"
        ariaLabel="Contour interval"
        min={SI_CONTOUR_INTERVAL_MIN}
        max={SI_CONTOUR_INTERVAL_MAX}
        step={1}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

/** Label typography controls (shown when labels are on). */
function TerrainContourLabelStudio({
  size,
  color,
  disabled,
  onSizeChange,
  onColorChange,
}: {
  size: number;
  color: string;
  disabled?: boolean;
  onSizeChange: (contourLabelSize: number) => void;
  onColorChange: (contourLabelColor: string) => void;
}) {
  const colorHex = toColorInputHex(color, '#bae6fd');
  return (
    <div className="si-elev-label-block" aria-label="Contour label style">
      <div className="si-elev-kicker">Labels on map</div>
      <div className="si-map-elevation-dock__row">
        <div className="si-map-elevation-dock__label">
          Size
          <span className="si-map-elevation-dock__value">{size}px</span>
        </div>
        <TerrainRangeTrack
          id="si-terrain-contour-label-size"
          ariaLabel="Label font size"
          min={SI_CONTOUR_LABEL_SIZE_MIN}
          max={SI_CONTOUR_LABEL_SIZE_MAX}
          step={1}
          value={size}
          disabled={disabled}
          onChange={v => onSizeChange(clampContourLabelSize(v))}
        />
      </div>
      <div className="si-elev-label-row">
        <span className="si-map-elevation-dock__label">Color</span>
        <input
          type="color"
          className="si-map-elevation-dock__color-input"
          value={colorHex}
          disabled={disabled}
          aria-label="Label color"
          onChange={e => onColorChange(normalizeContourLabelColor(e.target.value))}
        />
      </div>
      <p className="si-elev-hint">Elevation text along index contours (ArcGIS-style).</p>
    </div>
  );
}

function TerrainContourLineStudio({
  settings,
  disabled,
  onSettingsChange,
}: {
  settings: SiMapTerrainSettings;
  disabled?: boolean;
  onSettingsChange: (patch: Partial<SiMapTerrainSettings>) => void;
}) {
  const intervalHex = toColorInputHex(
    settings.contourIntervalLineColor,
    settings.contourColorTheme === 'light' ? '#0369a1' : '#38bdf8',
  );
  const mainHex = toColorInputHex(
    settings.contourMainLineColor,
    settings.contourColorTheme === 'light' ? '#0f172a' : '#f8fafc',
  );

  return (
    <>
      <div className="si-elev-divider" />
      <div className="si-elev-kicker">Line style</div>
      <div className="si-elev-segment" role="radiogroup" aria-label="Contour color theme">
        {(['dark', 'light'] as SiContourColorTheme[]).map(theme => {
          const active = settings.contourColorTheme === theme;
          return (
            <button
              key={theme}
              type="button"
              className={'si-elev-segment__btn' + (active ? ' si-elev-segment__btn--on' : '')}
              disabled={disabled}
              role="radio"
              aria-checked={active}
              onClick={() => onSettingsChange(siContourThemePatch(theme))}
            >
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          );
        })}
      </div>

      <div className="si-elev-label-row">
        <span className="si-map-elevation-dock__label">Interval</span>
        <input
          type="color"
          className="si-map-elevation-dock__color-input"
          value={intervalHex}
          disabled={disabled}
          aria-label="Interval line color"
          onChange={e =>
            onSettingsChange({
              contourIntervalLineColor: normalizeContourLineColor(e.target.value, intervalHex),
            })
          }
        />
      </div>

      {settings.contourMainLinesEnabled ? (
        <div className="si-elev-label-row">
          <span className="si-map-elevation-dock__label">Main</span>
          <input
            type="color"
            className="si-map-elevation-dock__color-input"
            value={mainHex}
            disabled={disabled}
            aria-label="Main line color"
            onChange={e =>
              onSettingsChange({
                contourMainLineColor: normalizeContourLineColor(e.target.value, mainHex),
              })
            }
          />
        </div>
      ) : null}

      <TerrainRangeSlider
        id="si-terrain-contour-interval-width"
        label="Interval width"
        valueLabel={`${settings.contourIntervalLineWidth.toFixed(2)}px`}
        min={SI_CONTOUR_LINE_WIDTH_MIN}
        max={SI_CONTOUR_LINE_WIDTH_MAX}
        step={0.05}
        value={settings.contourIntervalLineWidth}
        disabled={disabled}
        onChange={v => onSettingsChange({ contourIntervalLineWidth: clampContourLineWidth(v) })}
      />

      {settings.contourMainLinesEnabled ? (
        <TerrainRangeSlider
          id="si-terrain-contour-main-width"
          label="Main width"
          valueLabel={`${settings.contourMainLineWidth.toFixed(2)}px`}
          min={SI_CONTOUR_LINE_WIDTH_MIN}
          max={SI_CONTOUR_LINE_WIDTH_MAX}
          step={0.05}
          value={settings.contourMainLineWidth}
          disabled={disabled}
          onChange={v => onSettingsChange({ contourMainLineWidth: clampContourLineWidth(v) })}
        />
      ) : null}

      <TerrainRangeSlider
        id="si-terrain-contour-intensity"
        label="Interval opacity"
        valueLabel={`${pct(0, 1, settings.contourIntensity)}%`}
        min={0}
        max={1}
        step={0.02}
        value={settings.contourIntensity}
        disabled={disabled}
        onChange={contourIntensity => onSettingsChange({ contourIntensity })}
      />

      {settings.contourMainLinesEnabled ? (
        <TerrainRangeSlider
          id="si-terrain-contour-main-opacity"
          label="Main opacity"
          valueLabel={`${pct(0, 1, settings.contourMainLineOpacity)}%`}
          min={0}
          max={1}
          step={0.02}
          value={settings.contourMainLineOpacity}
          disabled={disabled}
          onChange={contourMainLineOpacity => onSettingsChange({ contourMainLineOpacity })}
        />
      ) : null}
    </>
  );
}

function TerrainContourClassificationStudio({
  settings,
  disabled,
  onSettingsChange,
}: {
  settings: SiMapTerrainSettings;
  disabled?: boolean;
  onSettingsChange: (patch: Partial<SiMapTerrainSettings>) => void;
}) {
  const mainIntervalM = settings.contourIntervalM * settings.contourMainLineEvery;
  return (
    <>
      <div className="si-elev-divider" />
      <div className="si-elev-kicker">Classification</div>
      <ElevChip
        checked={settings.contourClassificationEnabled}
        disabled={disabled}
        label="Classify values"
        onChange={v => onSettingsChange({ contourClassificationEnabled: v })}
      />

      {settings.contourClassificationEnabled ? (
        <div className="si-elev-segment" role="radiogroup" aria-label="Contour classification mode">
          {CONTOUR_CLASSIFICATION_MODES.map(mode => {
            const active = settings.contourClassificationMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={'si-elev-segment__btn' + (active ? ' si-elev-segment__btn--on' : '')}
                disabled={disabled}
                role="radio"
                aria-checked={active}
                title={mode.hint}
                onClick={() => onSettingsChange({ contourClassificationMode: mode.id })}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="si-elev-chip-row">
        <ElevChip
          checked={settings.contourMainLinesEnabled}
          disabled={disabled}
          label="Main lines"
          title={`Index every ${mainIntervalM} m`}
          onChange={v => onSettingsChange({ contourMainLinesEnabled: v })}
        />
      </div>

      {settings.contourMainLinesEnabled ? (
        <TerrainRangeSlider
          id="si-terrain-contour-main-every"
          label="Index ×"
          valueLabel={`×${settings.contourMainLineEvery}`}
          min={SI_CONTOUR_MAIN_LINE_EVERY_MIN}
          max={SI_CONTOUR_MAIN_LINE_EVERY_MAX}
          step={1}
          value={settings.contourMainLineEvery}
          disabled={disabled}
          onChange={contourMainLineEvery =>
            onSettingsChange({ contourMainLineEvery: clampContourMainLineEveryInput(contourMainLineEvery) })
          }
        />
      ) : null}
    </>
  );
}

/** Same esri track shell + range chrome as weather `si-weather-cloud`. */
function TerrainRangeSlider({
  id,
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="si-map-elevation-dock__row" htmlFor={id}>
      <span className="si-map-elevation-dock__label">
        {label}
        <span className="si-map-elevation-dock__value">{valueLabel}</span>
      </span>
      <TerrainRangeTrack
        id={id}
        ariaLabel={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}

function defaultTerrainPanelPos(): PanelPos {
  return siMapNorthPopoutFixedPosition(TERRAIN_PANEL_W, TERRAIN_PANEL_H, 'start');
}

function readStoredPos(): PanelPos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SI_TERRAIN_PANEL_POS_LS);
    if (!raw) return null;
    const o = JSON.parse(raw) as { left?: unknown; top?: unknown };
    const left = Number(o.left);
    const top = Number(o.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    if (!isFixedPanelInMapCanvas(left, top, TERRAIN_PANEL_W, TERRAIN_PANEL_H)) return null;
    return { left, top };
  } catch {
    return null;
  }
}

function clampPos(left: number, top: number, w: number, h: number): PanelPos {
  return clampFixedPanelPosition(left, top, w, h);
}

export function SiMapElevationDock({
  active,
  disabled = false,
  onToggle,
  onZoomIn,
  onZoomOut,
  settings,
  onSettingsChange,
}: SiMapElevationDockProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [terrainOpen, setTerrainOpen] = useState(true);
  const [contoursOpen, setContoursOpen] = useState(true);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<PanelPos>(defaultTerrainPanelPos());
  const [pos, setPos] = useState<PanelPos>(posRef.current);
  const [dragging, setDragging] = useState(false);
  const dragRafRef = useRef<number | null>(null);
  const dragPendingRef = useRef<PanelPos | null>(null);
  const snapDefaultOnOpenRef = useRef(false);

  const applyPanelPos = useCallback((next: PanelPos) => {
    posRef.current = next;
    const el = panelRef.current;
    if (el) {
      el.style.left = `${next.left}px`;
      el.style.top = `${next.top}px`;
    }
  }, []);

  const showPanel = active && panelOpen;

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    if (!active) setPanelOpen(false);
  }, [active]);

  const measure = useCallback(() => {
    const el = panelRef.current;
    if (!el) return { width: TERRAIN_PANEL_W, height: TERRAIN_PANEL_H };
    const r = el.getBoundingClientRect();
    return { width: r.width || TERRAIN_PANEL_W, height: r.height || TERRAIN_PANEL_H };
  }, []);

  const placePanelDefault = useCallback(
    (force = false) => {
      const stored = force ? null : readStoredPos();
      const base = stored ?? defaultTerrainPanelPos();
      const size = measure();
      const next = clampPos(base.left, base.top, size.width, size.height);
      applyPanelPos(next);
      setPos(next);
      return next;
    },
    [applyPanelPos, measure],
  );

  useEffect(() => {
    if (!active) {
      snapDefaultOnOpenRef.current = true;
      return;
    }
    if (!panelOpen) return;
    if (snapDefaultOnOpenRef.current) {
      snapDefaultOnOpenRef.current = false;
      placePanelDefault(true);
      return;
    }
    placePanelDefault(false);
  }, [active, panelOpen, placePanelDefault]);

  const openTerrainPanel = useCallback(() => {
    snapDefaultOnOpenRef.current = true;
    setPanelOpen(true);
  }, []);

  useEffect(() => {
    if (!showPanel) return;
    const onResize = () => {
      const size = measure();
      setPos(prev => {
        const next = clampPos(prev.left, prev.top, size.width, size.height);
        applyPanelPos(next);
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    const mapEl = document.querySelector('.si-map-container');
    const ro =
      mapEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (mapEl && ro) ro.observe(mapEl);
    const dock = mapEl?.querySelector('.si-sat-ctx-dock--map');
    if (dock && ro) ro.observe(dock);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [showPanel, measure, applyPanelPos]);

  useLayoutEffect(() => {
    if (!showPanel) return;
    const size = measure();
    setPos(prev => clampPos(prev.left, prev.top, size.width, size.height));
  }, [showPanel, panelMinimized, measure, settings.contourEnabled]);

  const persistPos = useCallback((p: PanelPos) => {
    try {
      localStorage.setItem(SI_TERRAIN_PANEL_POS_LS, JSON.stringify(p));
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

  return (
    <>
      <AnimatePresence>
        {showPanel ? (
          <motion.div
            ref={panelRef}
            id={panelId}
            className={
              'si-map-elevation-dock__panel si-map-elevation-dock__panel--floating' +
              (panelMinimized ? ' si-map-elevation-dock__panel--min' : '') +
              (dragging ? ' si-map-elevation-dock__panel--dragging' : '')
            }
            style={{ left: pos.left, top: pos.top, right: 'auto' }}
            role="dialog"
            aria-label="3D terrain controls"
            initial={{ opacity: 0, y: -18, scale: 0.98 }}
            animate={dragging ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            transition={{ duration: dragging ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <header
              className="si-map-elevation-dock__panel-head"
              onPointerDown={onDragHandlePointerDown}
              title="Drag to move"
            >
              <div className="si-map-elevation-dock__panel-brand">
                <i className="fa-solid fa-mountain-sun" aria-hidden />
                <h2 className="si-map-elevation-dock__panel-title">3D terrain</h2>
              </div>
              <div className="si-map-elevation-dock__panel-actions">
                <button
                  type="button"
                  className="si-map-elevation-dock__panel-icon-btn"
                  onClick={() => setPanelMinimized(m => !m)}
                  aria-label={panelMinimized ? 'Expand terrain controls' : 'Minimize terrain controls'}
                >
                  <i
                    className={`fa-solid ${panelMinimized ? 'fa-up-right-and-down-left-from-center' : 'fa-window-minimize'}`}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  className="si-map-elevation-dock__panel-icon-btn"
                  onClick={() => setPanelOpen(false)}
                  aria-label="Close terrain controls"
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            </header>

            {!panelMinimized ? (
              <div className="si-map-elevation-dock__panel-body">
                <ElevGroup
                  title="Terrain & view"
                  icon="fa-solid fa-layer-group"
                  open={terrainOpen}
                  onToggle={() => setTerrainOpen(o => !o)}
                >
                  <TerrainRangeSlider
                    id="si-terrain-exaggeration"
                    label="Height"
                    valueLabel={`${settings.exaggeration.toFixed(2)}×`}
                    min={SI_TERRAIN_EXAGGERATION_MIN}
                    max={SI_TERRAIN_EXAGGERATION_MAX}
                    step={0.05}
                    value={settings.exaggeration}
                    disabled={disabled}
                    onChange={exaggeration => onSettingsChange({ exaggeration })}
                  />
                  <TerrainRangeSlider
                    id="si-terrain-hillshade"
                    label="Intensity"
                    valueLabel={`${pct(0, 1, settings.hillshadeIntensity)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.hillshadeIntensity}
                    disabled={disabled}
                    onChange={hillshadeIntensity => onSettingsChange({ hillshadeIntensity })}
                  />
                </ElevGroup>

                <ElevGroup
                  title="Contours"
                  icon="fa-solid fa-wave-square"
                  open={contoursOpen}
                  onToggle={() => setContoursOpen(o => !o)}
                >
                  <div className="si-elev-chip-row">
                    <ElevChip
                      checked={settings.contourEnabled}
                      disabled={disabled}
                      label="Lines"
                      onChange={v =>
                        onSettingsChange({
                          contourEnabled: v,
                          ...(v ? {} : { contourLabelsEnabled: false }),
                        })
                      }
                    />
                    {settings.contourEnabled ? (
                      <ElevChip
                        checked={settings.contourLabelsEnabled}
                        disabled={disabled}
                        label="Labels"
                        title="ArcGIS-style elevation on index contours"
                        onChange={v => onSettingsChange({ contourLabelsEnabled: v })}
                      />
                    ) : null}
                  </div>

                  {settings.contourEnabled ? (
                    <>
                      {settings.contourLabelsEnabled ? (
                        <TerrainContourLabelStudio
                          size={settings.contourLabelSize}
                          color={settings.contourLabelColor}
                          disabled={disabled}
                          onSizeChange={contourLabelSize => onSettingsChange({ contourLabelSize })}
                          onColorChange={contourLabelColor => onSettingsChange({ contourLabelColor })}
                        />
                      ) : null}
                      <TerrainContourIntervalControl
                        value={settings.contourIntervalM}
                        disabled={disabled}
                        onChange={contourIntervalM => onSettingsChange({ contourIntervalM })}
                      />
                      <TerrainContourLineStudio
                        settings={settings}
                        disabled={disabled}
                        onSettingsChange={onSettingsChange}
                      />
                      <TerrainContourClassificationStudio
                        settings={settings}
                        disabled={disabled}
                        onSettingsChange={onSettingsChange}
                      />
                    </>
                  ) : null}
                </ElevGroup>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="si-map-elevation-dock" role="group" aria-label="Map elevation and zoom">
        <div className="si-map-elevation-dock__controls">
          <div className="si-map-elevation-dock__zoom" role="group" aria-label="Zoom in and out">
            <button
              type="button"
              className="si-map-elevation-dock__zoom-btn"
              onClick={onZoomIn}
              disabled={disabled}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <i className="fa-solid fa-plus" aria-hidden />
            </button>
            <button
              type="button"
              className="si-map-elevation-dock__zoom-btn"
              onClick={onZoomOut}
              disabled={disabled}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <i className="fa-solid fa-minus" aria-hidden />
            </button>
          </div>

          <div className="si-map-elevation-dock__column" aria-label="3D elevation">
            <div className="si-map-elevation-dock__primary">
              <button
                type="button"
                className={'si-map-elevation-dock__fab' + (active ? ' si-map-elevation-dock__fab--on' : '')}
                onClick={() => {
                  if (!active) {
                    openTerrainPanel();
                  }
                  onToggle();
                }}
                disabled={disabled}
                title={active ? 'Disable 3D Elevation View' : 'Enable 3D Elevation View'}
                aria-label={active ? 'Disable 3D elevation view' : 'Enable 3D elevation view'}
                aria-pressed={active}
                aria-expanded={active ? panelOpen : false}
                aria-controls={active ? panelId : undefined}
              >
                <i className="fa-solid fa-mountain-sun si-map-elevation-dock__fab-icon" aria-hidden />
              </button>

              {active ? (
                <button
                  type="button"
                  className={'si-map-elevation-dock__gear' + (panelOpen ? ' si-map-elevation-dock__gear--on' : '')}
                  onClick={() => {
                    setPanelOpen(o => {
                      if (o) return false;
                      openTerrainPanel();
                      return true;
                    });
                  }}
                  disabled={disabled}
                  aria-label={panelOpen ? 'Hide terrain controls' : 'Terrain & contour controls'}
                  aria-expanded={panelOpen}
                  aria-controls={panelId}
                  title="Terrain height, scaling & contours"
                >
                  <i className="fa-solid fa-sliders" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
