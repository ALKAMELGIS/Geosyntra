import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SiMapElevationProfileChart } from './SiMapElevationProfileChart';
import type {
  SiElevationProfileSample,
  SiElevationProfileStats,
  SiElevationProfileUnit,
} from '../utils/siMapElevationProfile';
import {
  persistSiElevProfileDockRect,
  persistSiElevProfileDockTheme,
  readSiElevProfileDockRect,
  readSiElevProfileDockTheme,
  type SiElevProfileDockRect,
  type SiElevProfileDockTheme,
} from '../utils/siMapElevationProfileDockTheme';
import './SiMapElevationProfileDock.css';

const SI_ELEV_DOCK_MIN_W = 260;
const SI_ELEV_DOCK_MIN_H = 180;
const SI_ELEV_DOCK_MARGIN = 8;

type SiElevDockHostSize = { w: number; h: number };

function clampSiElevDockRect(rect: SiElevProfileDockRect, host: SiElevDockHostSize): SiElevProfileDockRect {
  const maxW = Math.max(SI_ELEV_DOCK_MIN_W, host.w - SI_ELEV_DOCK_MARGIN * 2);
  const maxH = Math.max(SI_ELEV_DOCK_MIN_H, host.h - SI_ELEV_DOCK_MARGIN * 2);
  const w = Math.max(SI_ELEV_DOCK_MIN_W, Math.min(rect.w, maxW));
  const h = Math.max(SI_ELEV_DOCK_MIN_H, Math.min(rect.h, maxH));
  const x = Math.max(SI_ELEV_DOCK_MARGIN, Math.min(rect.x, Math.max(SI_ELEV_DOCK_MARGIN, host.w - w - SI_ELEV_DOCK_MARGIN)));
  const y = Math.max(SI_ELEV_DOCK_MARGIN, Math.min(rect.y, Math.max(SI_ELEV_DOCK_MARGIN, host.h - h - SI_ELEV_DOCK_MARGIN)));
  return { x, y, w, h };
}

function defaultSiElevDockRect(host: SiElevDockHostSize): SiElevProfileDockRect {
  const w = Math.min(560, Math.max(300, Math.round(host.w * 0.4)));
  const h = Math.min(300, Math.max(190, Math.round(host.h * 0.34)));
  return clampSiElevDockRect({ x: (host.w - w) / 2, y: host.h - h - 16, w, h }, host);
}

export type { SiElevProfileDockTheme } from '../utils/siMapElevationProfileDockTheme';

export type SiMapElevationProfileDockProps = {
  mapRef: RefObject<{ getMap?: () => unknown } | null>;
  mapLoaded: boolean;
  open: boolean;
  minimized: boolean;
  onMinimizedChange: (v: boolean) => void;
  sketching: boolean;
  loading: boolean;
  vertexCount: number;
  samples: SiElevationProfileSample[];
  stats: SiElevationProfileStats | null;
  unit: SiElevationProfileUnit;
  activeIndex: number;
  onActiveIndexChange: (idx: number) => void;
  onClose: () => void;
  onStartSketch: () => void;
  onFinishSketch: () => void;
  onClear: () => void;
  onReverse: () => void;
  onUndoVertex: () => void;
  onUnitChange: (unit: SiElevationProfileUnit) => void;
};

function resolveMapShell(map: { getCanvasContainer?: () => HTMLElement } | null): HTMLElement | null {
  if (!map || typeof map.getCanvasContainer !== 'function') return null;
  const canvasHost = map.getCanvasContainer() as HTMLElement;
  return (canvasHost.closest('.si-map-container') as HTMLElement | null) ?? canvasHost;
}

export function SiMapElevationProfileDock({
  mapRef,
  mapLoaded,
  open,
  minimized,
  onMinimizedChange,
  sketching,
  loading,
  vertexCount,
  samples,
  stats,
  unit,
  activeIndex,
  onActiveIndexChange,
  onClose,
  onStartSketch,
  onFinishSketch,
  onClear,
  onReverse,
  onUndoVertex,
  onUnitChange,
}: SiMapElevationProfileDockProps) {
  const [shell, setShell] = useState<HTMLElement | null>(null);
  const [theme, setTheme] = useState<SiElevProfileDockTheme>(readSiElevProfileDockTheme);
  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<SiElevProfileDockRect | null>(() => readSiElevProfileDockRect());
  const rectRef = useRef<SiElevProfileDockRect | null>(rect);
  rectRef.current = rect;

  const hostSize = useCallback((): SiElevDockHostSize => {
    const el = hostRef.current;
    return {
      w: el?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280),
      h: el?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720),
    };
  }, []);

  /** Shared pointer gesture: drag (move) or resize, updating the panel via direct DOM for smoothness. */
  const beginGesture = useCallback(
    (event: ReactPointerEvent, mode: 'move' | 'resize') => {
      if (mode === 'move') {
        const target = event.target as HTMLElement;
        if (target.closest('button, select, a, input, [role="button"]')) return;
      }
      const origin = rectRef.current;
      if (!origin) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const host = hostSize();
      const base = { ...origin };

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const next =
          mode === 'move'
            ? clampSiElevDockRect({ ...base, x: base.x + dx, y: base.y + dy }, host)
            : clampSiElevDockRect({ ...base, w: base.w + dx, h: base.h + dy }, host);
        const el = panelRef.current;
        if (el) {
          el.style.left = `${next.x}px`;
          el.style.top = `${next.y}px`;
          el.style.width = `${next.w}px`;
          el.style.height = `${next.h}px`;
        }
        rectRef.current = next;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        const final = rectRef.current;
        if (final) {
          setRect(final);
          persistSiElevProfileDockRect(final);
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [hostSize],
  );

  const startDrag = useCallback((event: ReactPointerEvent) => beginGesture(event, 'move'), [beginGesture]);
  const startResize = useCallback((event: ReactPointerEvent) => beginGesture(event, 'resize'), [beginGesture]);

  useLayoutEffect(() => {
    if (!open || !mapLoaded || typeof window === 'undefined') {
      setShell(null);
      return;
    }
    const sync = () => {
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      setShell(resolveMapShell(map as { getCanvasContainer?: () => HTMLElement } | null));
    };
    sync();
    const ro = new ResizeObserver(sync);
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    const shellEl = resolveMapShell(map as { getCanvasContainer?: () => HTMLElement } | null);
    if (shellEl) ro.observe(shellEl);
    window.addEventListener('resize', sync);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      document.removeEventListener('fullscreenchange', sync);
    };
  }, [open, mapLoaded, mapRef]);

  // Place / clamp the window inside the map shell when it becomes visible (uses saved session rect).
  useLayoutEffect(() => {
    if (!open || !shell || minimized) return;
    const host = hostSize();
    setRect(prev => {
      const base = prev ?? readSiElevProfileDockRect() ?? defaultSiElevDockRect(host);
      return clampSiElevDockRect(base, host);
    });
  }, [open, shell, minimized, hostSize]);

  // Keep the window on-screen when the viewport / map resizes.
  useEffect(() => {
    if (!open || minimized) return;
    const onResize = () => {
      const host = hostSize();
      setRect(prev => (prev ? clampSiElevDockRect(prev, host) : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, minimized, hostSize]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: SiElevProfileDockTheme = prev === 'dark' ? 'light' : 'dark';
      persistSiElevProfileDockTheme(next);
      return next;
    });
  }, []);

  if (!open || !shell) return null;

  const hasProfile = samples.length > 1;
  const isLight = theme === 'light';
  const themeClass = isLight ? ' si-elev-profile-dock--light' : ' si-elev-profile-dock--dark';

  const status: { tone: 'idle' | 'active' | 'busy' | 'ready'; label: string } = loading
    ? { tone: 'busy', label: 'Analyzing terrain…' }
    : sketching
      ? { tone: 'active', label: `Drawing · ${vertexCount} pt${vertexCount === 1 ? '' : 's'}` }
      : hasProfile
        ? { tone: 'ready', label: `Ready · ${samples.length} samples` }
        : { tone: 'idle', label: 'Idle' };

  return createPortal(
    <div ref={hostRef} className="si-elev-profile-dock-host" data-si-elev-profile-dock="" aria-hidden={false}>
      <AnimatePresence mode="wait">
        {minimized ? (
          <motion.button
            key="min-pill"
            type="button"
            className={`si-elev-profile-dock__pill${themeClass}`}
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.94 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onMinimizedChange(false)}
            aria-label="Expand elevation profile"
            title="Expand elevation profile"
          >
            <i className="fa-solid fa-chart-area" aria-hidden />
            <span>Elevation Profile</span>
            {hasProfile ? (
              <span className="si-elev-profile-dock__pill-badge" aria-hidden>
                {samples.length}
              </span>
            ) : null}
            <i className="fa-solid fa-up-right-and-down-left-from-center si-elev-profile-dock__pill-expand" aria-hidden />
          </motion.button>
        ) : (
          <motion.div
            key="panel"
            ref={panelRef}
            className={`si-elev-profile-dock${themeClass}`}
            role="dialog"
            aria-label="Elevation profile"
            aria-modal="false"
            style={
              rect
                ? {
                    position: 'absolute',
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    margin: 0,
                    maxWidth: 'none',
                    maxHeight: 'none',
                  }
                : undefined
            }
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <header
              className="si-elev-profile-dock__head"
              onPointerDown={startDrag}
              title="Drag to move"
            >
              <div className="si-elev-profile-dock__brand">
                <i className="fa-solid fa-mountain" aria-hidden />
                <h3 className="si-elev-profile-dock__title">Elevation Profile</h3>
                <span
                  className={`si-elev-profile-dock__status si-elev-profile-dock__status--${status.tone}`}
                  aria-live="polite"
                >
                  <span className="si-elev-profile-dock__status-dot" aria-hidden />
                  {status.label}
                </span>
              </div>
              <div className="si-elev-profile-dock__actions">
                <label className="si-elev-profile-dock__unit">
                  <span className="sr-only">Units</span>
                  <select
                    value={unit}
                    onChange={e => onUnitChange(e.target.value as SiElevationProfileUnit)}
                    aria-label="Elevation units"
                  >
                    <option value="ft">ft</option>
                    <option value="m">m</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="si-elev-profile-dock__theme-toggle"
                  onClick={toggleTheme}
                  aria-label={isLight ? 'Switch to dark glass theme' : 'Switch to light glass theme'}
                  title={isLight ? 'Dark glass theme' : 'Light glass theme'}
                >
                  <i className={`fa-solid ${isLight ? 'fa-moon' : 'fa-sun'}`} aria-hidden />
                </button>
                <span className="si-elev-profile-dock__actions-divider" aria-hidden />
                <button
                  type="button"
                  className="si-elev-profile-dock__icon-btn"
                  title="Reverse profile direction"
                  aria-label="Reverse profile"
                  disabled={vertexCount < 2 && !hasProfile}
                  onClick={onReverse}
                >
                  <i className="fa-solid fa-right-left" aria-hidden />
                </button>
                <button
                  type="button"
                  className="si-elev-profile-dock__icon-btn"
                  title="Minimize panel"
                  aria-label="Minimize panel"
                  onClick={() => onMinimizedChange(true)}
                >
                  <i className="fa-solid fa-window-minimize" aria-hidden />
                </button>
                <button
                  type="button"
                  className="si-elev-profile-dock__icon-btn"
                  title="Close"
                  aria-label="Close elevation profile"
                  onClick={onClose}
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            </header>

            <div className="si-elev-profile-dock__body">
              <div className="si-elev-profile-dock__toolbar">
                {sketching ? (
                  <>
                    <span className="si-elev-profile-dock__hint">
                      Click the map to add points ({vertexCount}). Double-click or Generate when done.
                    </span>
                    <div className="si-elev-profile-dock__toolbar-btns">
                      <button type="button" className="si-elev-profile-dock__btn" onClick={onUndoVertex} disabled={vertexCount === 0}>
                        Undo
                      </button>
                      <button
                        type="button"
                        className="si-elev-profile-dock__btn si-elev-profile-dock__btn--primary"
                        onClick={onFinishSketch}
                        disabled={vertexCount < 2 || loading}
                      >
                        {loading ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : 'Generate'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="si-elev-profile-dock__toolbar-btns">
                    <button type="button" className="si-elev-profile-dock__btn si-elev-profile-dock__btn--primary" onClick={onStartSketch}>
                      <i className="fa-solid fa-pen-line" aria-hidden /> Draw line
                    </button>
                    <button type="button" className="si-elev-profile-dock__btn" onClick={onClear} disabled={vertexCount === 0 && !hasProfile}>
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div className="si-elev-profile-dock__content">
                {hasProfile ? (
                  <SiMapElevationProfileChart
                    samples={samples}
                    stats={stats}
                    unit={unit}
                    activeIndex={activeIndex}
                    onActiveIndexChange={onActiveIndexChange}
                    theme={theme}
                  />
                ) : (
                  <p className="si-elev-profile-dock__empty">
                    Draw a path on the map to sample ground elevation (Mapbox terrain DEM with Open-Meteo fallback).
                  </p>
                )}
              </div>
            </div>

            <div
              className="si-elev-profile-dock__resize"
              onPointerDown={startResize}
              role="separator"
              aria-label="Resize panel"
              title="Drag to resize"
            >
              <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    shell,
  );
}
