import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { motion } from 'framer-motion';
import { Marker } from 'react-map-gl/mapbox';
import {
  SiMapWeatherIntelMapHost,
  useSiMapWeatherIntelLayout,
} from './SiMapWeatherIntelMapHost';
import {
  fetchOpenMeteoMapWeather,
  openMeteoForwardGeocode,
  type OpenMeteoMapWeatherBundle,
} from '../../../lib/openMeteoMapWeather';
import {
  fetchOpenMeteoHistoricalDay,
  fetchOpenMeteoTemporalComparison,
  historicalDayToMapBundle,
  isOpenMeteoViewDateToday,
  OPEN_METEO_HISTORICAL_MIN_DATE,
  type OpenMeteoTemporalComparison,
} from '../../../lib/openMeteoMapWeatherHistorical';
import { wxHistoryOpenMeteoLatestEndDate } from '../../../lib/openWeatherTimeHistory';
import { SiMapWeatherTemporalComparison } from './SiMapWeatherTemporalComparison';
import type { SiMapWeatherPanelTheme } from '../utils/siMapWeatherTypes';
import {
  clampWeatherIntelPanelPosition,
  clampWeatherIntelPanelSize,
  SI_WX_INTEL_PANEL_W,
  SI_WX_INTEL_PANEL_W_HISTORY,
  weatherIntelDefaultPanelPosition,
  weatherIntelPanelPositionAtPin,
  type SiMapWeatherIntelLayout,
  type SiMapWeatherIntelPanelPos,
} from '../utils/siMapWeatherIntelLayout';
import { SiMapWeatherTimeHistoryPanel } from './SiMapWeatherTimeHistoryPanel';
import { SiWeatherColoredIcon, SiWeatherColoredIconFromMetric } from './SiWeatherColoredIcon';
import './SiMapWeatherIntelPopup.css';
import './SiMapWeatherTimeHistoryPanel.css';

export type SiMapWeatherIntelSource = 'click' | 'search' | 'feature';

export type SiMapWeatherIntelPin = {
  lng: number;
  lat: number;
  name?: string;
  source: SiMapWeatherIntelSource;
};

const SI_WX_INTEL_POS_SS = 'si-map-wx-intel-panel-pos-v1';
const SI_WX_INTEL_SIZE_SS = 'si-map-wx-intel-panel-size-v1';

type WxIntelPanelSize = { width: number; height: number };

function readStoredPanelSize(): WxIntelPanelSize | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SI_WX_INTEL_SIZE_SS);
    if (!raw) return null;
    const o = JSON.parse(raw) as { width?: unknown; height?: unknown };
    const width = Number(o.width);
    const height = Number(o.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function defaultWxIntelPanelSize(layout: SiMapWeatherIntelLayout, historyOpen: boolean): WxIntelPanelSize {
  return {
    width: historyOpen ? SI_WX_INTEL_PANEL_W_HISTORY : layout.width,
    height: layout.maxHeight,
  };
}

type SiMapWeatherIntelPopupProps = {
  pin: SiMapWeatherIntelPin | null;
  mapRef: RefObject<{ getMap?: () => unknown } | null>;
  mapLoaded: boolean;
  toolboxPanelOpen?: boolean;
  leftFloatingReserve?: number;
  theme: SiMapWeatherPanelTheme;
  onClose: () => void;
  onPinChange?: (pin: SiMapWeatherIntelPin) => void;
  externalSearchQuery?: string;
  onExternalSearchConsumed?: () => void;
  openWeatherApiKey?: string;
  aoiCentroid?: { lng: number; lat: number } | null;
  aoiLabel?: string | null;
};

function formatTemp(c: number | null): string {
  if (c == null || !Number.isFinite(c)) return '—';
  return `${Math.round(c)}°C`;
}

function formatDay(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function readStoredPanelPos(): SiMapWeatherIntelPanelPos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SI_WX_INTEL_POS_SS);
    if (!raw) return null;
    const o = JSON.parse(raw) as { left?: unknown; top?: unknown };
    const left = Number(o.left);
    const top = Number(o.top);
    if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
  } catch {
    /* ignore */
  }
  return null;
}

function resolveMapboxMap(mapRef: RefObject<{ getMap?: () => unknown } | null>) {
  const raw = mapRef.current?.getMap?.() ?? mapRef.current;
  if (!raw || typeof (raw as { project?: unknown }).project !== 'function') return null;
  return raw as {
    project: (lngLat: [number, number]) => { x: number; y: number };
    getContainer?: () => HTMLElement;
    on: (event: string, fn: () => void) => void;
    off: (event: string, fn: () => void) => void;
  };
}

function SiMapWeatherIntelPopupPanel({
  pin,
  mapRef,
  theme,
  onClose,
  onPinChange,
  externalSearchQuery,
  onExternalSearchConsumed,
  openWeatherApiKey = '',
  aoiCentroid = null,
  aoiLabel = null,
  historyOpen,
  onHistoryOpenChange,
}: Omit<SiMapWeatherIntelPopupProps, 'mapLoaded' | 'toolboxPanelOpen' | 'leftFloatingReserve'> & {
  pin: SiMapWeatherIntelPin;
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
}) {
  const layout = useSiMapWeatherIntelLayout();
  const shellRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<SiMapWeatherIntelPanelPos>({ left: 12, top: 12 });
  const [pos, setPos] = useState<SiMapWeatherIntelPanelPos>(posRef.current);
  const [dragging, setDragging] = useState(false);
  const dragRafRef = useRef<number | null>(null);
  const dragPendingRef = useRef<SiMapWeatherIntelPanelPos | null>(null);
  const [panelSize, setPanelSize] = useState<WxIntelPanelSize | null>(() => readStoredPanelSize());
  const [resizing, setResizing] = useState(false);
  const userPositionedRef = useRef(false);

  const [bundle, setBundle] = useState<OpenMeteoMapWeatherBundle | null>(null);
  const [comparison, setComparison] = useState<OpenMeteoTemporalComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => wxHistoryOpenMeteoLatestEndDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxHistoricalDate = wxHistoryOpenMeteoLatestEndDate();
  const viewingToday = isOpenMeteoViewDateToday(selectedDate);
  const [searchDraft, setSearchDraft] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pinKey = `${pin.lng.toFixed(5)}:${pin.lat.toFixed(5)}`;

  const measurePanel = useCallback(() => {
    const el = shellRef.current;
    const layoutW = layout?.width ?? SI_WX_INTEL_PANEL_W;
    const layoutMaxH = layout?.maxHeight ?? 340;
    const w = panelSize?.width ?? layoutW;
    const h = panelSize?.height ?? layoutMaxH;
    if (!el) return { width: w, height: h };
    const r = el.getBoundingClientRect();
    return {
      width: r.width || w,
      height: r.height || h,
    };
  }, [layout, panelSize]);

  const applyPanelPos = useCallback((next: SiMapWeatherIntelPanelPos) => {
    posRef.current = next;
    const el = shellRef.current;
    if (el) {
      el.style.left = `${next.left}px`;
      el.style.top = `${next.top}px`;
    }
  }, []);

  const resolveAnchoredPos = useCallback((): SiMapWeatherIntelPanelPos | null => {
    if (!layout) return null;
    const map = resolveMapboxMap(mapRef);
    if (!map) return null;
    const size = measurePanel();
    return weatherIntelPanelPositionAtPin(pin.lng, pin.lat, map, layout, size.width, size.height);
  }, [layout, mapRef, measurePanel, pin.lat, pin.lng]);

  const applyAnchoredOrDefault = useCallback(() => {
    if (!layout) return;
    const size = measurePanel();
    const next = userPositionedRef.current
      ? clampWeatherIntelPanelPosition(
          posRef.current.left,
          posRef.current.top,
          size.width,
          size.height,
          layout,
        )
      : resolveAnchoredPos() ?? weatherIntelDefaultPanelPosition(layout);
    setPos(next);
    applyPanelPos(next);
  }, [applyPanelPos, layout, measurePanel, resolveAnchoredPos]);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    userPositionedRef.current = false;
    setSelectedDate(wxHistoryOpenMeteoLatestEndDate());
    try {
      sessionStorage.removeItem(SI_WX_INTEL_POS_SS);
    } catch {
      /* ignore */
    }
  }, [pinKey]);

  useLayoutEffect(() => {
    if (!layout) return;
    setPanelSize(prev => {
      if (!prev) return prev;
      const clamped = clampWeatherIntelPanelSize(prev.width, prev.height, layout);
      if (clamped.width === prev.width && clamped.height === prev.height) return prev;
      return clamped;
    });
  }, [layout, historyOpen]);

  useLayoutEffect(() => {
    applyAnchoredOrDefault();
  }, [layout, historyOpen, pinKey, panelSize, applyAnchoredOrDefault]);

  useEffect(() => {
    const map = resolveMapboxMap(mapRef);
    if (!map || !layout) return;
    const onMapViewChange = () => {
      if (userPositionedRef.current) return;
      applyAnchoredOrDefault();
    };
    map.on('move', onMapViewChange);
    map.on('zoom', onMapViewChange);
    map.on('rotate', onMapViewChange);
    map.on('pitch', onMapViewChange);
    map.on('resize', onMapViewChange);
    return () => {
      map.off('move', onMapViewChange);
      map.off('zoom', onMapViewChange);
      map.off('rotate', onMapViewChange);
      map.off('pitch', onMapViewChange);
      map.off('resize', onMapViewChange);
    };
  }, [applyAnchoredOrDefault, layout, mapRef, pinKey]);

  const persistPos = useCallback((p: SiMapWeatherIntelPanelPos) => {
    try {
      sessionStorage.setItem(SI_WX_INTEL_POS_SS, JSON.stringify(p));
      userPositionedRef.current = true;
    } catch {
      /* ignore */
    }
  }, []);

  const persistSize = useCallback((s: WxIntelPanelSize) => {
    try {
      sessionStorage.setItem(SI_WX_INTEL_SIZE_SS, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

  const resetPanelSize = useCallback(() => {
    if (!layout) return;
    setPanelSize(null);
    try {
      sessionStorage.removeItem(SI_WX_INTEL_SIZE_SS);
    } catch {
      /* ignore */
    }
    applyAnchoredOrDefault();
  }, [applyAnchoredOrDefault, layout]);

  const applyResizeSize = useCallback(
    (width: number, height: number) => {
      if (!layout) return;
      const next = clampWeatherIntelPanelSize(width, height, layout);
      setPanelSize(next);
      const el = shellRef.current;
      if (el) {
        el.style.width = `${next.width}px`;
        el.style.height = `${next.height}px`;
        el.style.maxHeight = `${next.height}px`;
      }
      const posNext = clampWeatherIntelPanelPosition(
        posRef.current.left,
        posRef.current.top,
        next.width,
        next.height,
        layout,
      );
      applyPanelPos(posNext);
    },
    [applyPanelPos, layout],
  );

  const onResizeCardPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!layout) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const size0 = measurePanel();
      const start = { w: size0.width, h: size0.height, cx: e.clientX, cy: e.clientY };
      setResizing(true);
      document.body.classList.add('si-map-wx-intel-resize-active');

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        ev.preventDefault();
        applyResizeSize(start.w + (ev.clientX - start.cx), start.h + (ev.clientY - start.cy));
      };

      const finish = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        setResizing(false);
        document.body.classList.remove('si-map-wx-intel-resize-active');
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        const el = shellRef.current;
        if (el && layout) {
          const r = el.getBoundingClientRect();
          const settled = clampWeatherIntelPanelSize(r.width, r.height, layout);
          setPanelSize(settled);
          persistSize(settled);
          const posNext = clampWeatherIntelPanelPosition(
            posRef.current.left,
            posRef.current.top,
            settled.width,
            settled.height,
            layout,
          );
          setPos(posNext);
          applyPanelPos(posNext);
        }
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [applyPanelPos, applyResizeSize, layout, measurePanel, persistSize],
  );

  const onCornerResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!layout) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const size0 = measurePanel();
      const start = { w: size0.width, h: size0.height, cx: e.clientX, cy: e.clientY };
      setResizing(true);
      document.body.classList.add('si-map-wx-intel-resize-active');

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        ev.preventDefault();
        applyResizeSize(start.w + (ev.clientX - start.cx), start.h + (ev.clientY - start.cy));
      };

      const finish = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        setResizing(false);
        document.body.classList.remove('si-map-wx-intel-resize-active');
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        const el = shellRef.current;
        if (el && layout) {
          const r = el.getBoundingClientRect();
          const settled = clampWeatherIntelPanelSize(r.width, r.height, layout);
          setPanelSize(settled);
          persistSize(settled);
          const posNext = clampWeatherIntelPanelPosition(
            posRef.current.left,
            posRef.current.top,
            settled.width,
            settled.height,
            layout,
          );
          setPos(posNext);
          applyPanelPos(posNext);
        }
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [applyPanelPos, applyResizeSize, layout, measurePanel, persistSize],
  );

  const onDragHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!layout) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, label, a, select, textarea')) return;

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
        const size = measurePanel();
        dragPendingRef.current = clampWeatherIntelPanelPosition(
          start.left + (ev.clientX - start.cx),
          start.top + (ev.clientY - start.cy),
          size.width,
          size.height,
          layout,
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
        setDragging(false);
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        const size = measurePanel();
        const settled = clampWeatherIntelPanelPosition(
          posRef.current.left,
          posRef.current.top,
          size.width,
          size.height,
          layout,
        );
        setPos(settled);
        applyPanelPos(settled);
        persistPos(settled);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [applyPanelPos, layout, measurePanel, persistPos],
  );

  useEffect(
    () => () => {
      if (dragRafRef.current != null) window.cancelAnimationFrame(dragRafRef.current);
    },
    [],
  );

  const loadComparison = useCallback(async (target: SiMapWeatherIntelPin) => {
    setComparisonLoading(true);
    try {
      const data = await fetchOpenMeteoTemporalComparison(target.lat, target.lng, target.name);
      setComparison(data);
    } catch {
      setComparison(null);
    } finally {
      setComparisonLoading(false);
    }
  }, []);

  const loadWeather = useCallback(async (target: SiMapWeatherIntelPin, dateIso: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const data = isOpenMeteoViewDateToday(dateIso)
        ? await fetchOpenMeteoMapWeather(target.lat, target.lng, target.name)
        : historicalDayToMapBundle(
            await fetchOpenMeteoHistoricalDay(target.lat, target.lng, dateIso, target.name),
          );
      if (ac.signal.aborted) return;
      setBundle(data);
    } catch (e) {
      if (ac.signal.aborted) return;
      setBundle(null);
      setError(e instanceof Error ? e.message : 'Weather fetch failed');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeather(pin, selectedDate);
    return () => abortRef.current?.abort();
  }, [pinKey, pin?.name, loadWeather, pin, selectedDate]);

  useEffect(() => {
    void loadComparison(pin);
  }, [pinKey, loadComparison, pin]);

  const runSearch = useCallback(async () => {
    const q = searchDraft.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    const geo = await openMeteoForwardGeocode(q);
    if (!geo) {
      setError('Location not found. Try a place name or lat,lng.');
      setLoading(false);
      return;
    }
    const next: SiMapWeatherIntelPin = {
      lng: geo.lng,
      lat: geo.lat,
      name: geo.name,
      source: 'search',
    };
    onPinChange?.(next);
    await loadWeather(next, selectedDate);
    void loadComparison(next);
  }, [searchDraft, loadWeather, loadComparison, onPinChange, selectedDate]);

  useEffect(() => {
    const q = externalSearchQuery?.trim();
    if (!q) return;
    setSearchDraft(q);
    void (async () => {
      const geo = await openMeteoForwardGeocode(q);
      onExternalSearchConsumed?.();
      if (!geo) return;
      const next: SiMapWeatherIntelPin = {
        lng: geo.lng,
        lat: geo.lat,
        name: geo.name,
        source: 'search',
      };
      onPinChange?.(next);
      await loadWeather(next, selectedDate);
      void loadComparison(next);
    })();
  }, [externalSearchQuery, onExternalSearchConsumed, onPinChange, loadWeather, loadComparison, selectedDate]);

  const useAoiCenter = useCallback(() => {
    if (!aoiCentroid) return;
    const next: SiMapWeatherIntelPin = {
      lng: aoiCentroid.lng,
      lat: aoiCentroid.lat,
      name: aoiLabel ?? 'AOI center',
      source: 'feature',
    };
    onPinChange?.(next);
    void loadWeather(next, selectedDate);
    void loadComparison(next);
  }, [aoiCentroid, aoiLabel, onPinChange, loadWeather, loadComparison, selectedDate]);

  const cur = bundle?.current;
  const themeClass = theme === 'light' ? 'si-map-wx-intel--light' : 'si-map-wx-intel--dark';
  const layoutW = layout?.width ?? SI_WX_INTEL_PANEL_W;
  const layoutMaxH = layout?.maxHeight ?? 340;
  const resolvedSize = layout
    ? panelSize ?? defaultWxIntelPanelSize(layout, historyOpen)
    : { width: layoutW, height: layoutMaxH };

  const openHeadDatePicker = useCallback(() => {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {
      el.click();
    }
  }, []);

  const shellStyle = {
    left: pos.left,
    top: pos.top,
    width: resolvedSize.width,
    height: resolvedSize.height,
    maxHeight: resolvedSize.height,
  };

  return (
    <motion.div
      ref={shellRef}
      className={
        `si-map-wx-intel si-map-wx-intel--floating si-map-wx-intel--anchored si-map-wx-intel--compact ${themeClass}` +
        (historyOpen ? ' si-map-wx-intel--history-open' : '') +
        (dragging ? ' si-map-wx-intel--dragging' : '') +
        (resizing ? ' si-map-wx-intel--resizing' : '') +
        (panelSize ? ' si-map-wx-intel--sized' : '')
      }
      style={shellStyle}
      role="dialog"
      aria-label="Open-Meteo weather"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={dragging ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: dragging ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      <header className="si-map-wx-intel__head">
        <div
          className="si-map-wx-intel__head-row"
          onPointerDown={onDragHandlePointerDown}
          role="toolbar"
          aria-label="Drag weather panel"
          title="Drag to move"
        >
          <div className="si-map-wx-intel__head-text">
            <span className="si-map-wx-intel__eyebrow">Open-Meteo</span>
            <h3 className="si-map-wx-intel__title">{bundle?.placeName ?? pin.name ?? 'Selected point'}</h3>
            <p className="si-map-wx-intel__coords">
              {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
              {pin.source === 'feature' ? ' · Layer' : pin.source === 'search' ? ' · Search' : ' · Map'}
            </p>
          </div>
          <div className="si-map-wx-intel__head-actions">
            <button
              type="button"
              className={`si-map-wx-intel__icon-btn si-map-wx-intel__icon-btn--chart${historyOpen ? ' is-active' : ''}`}
              title="Weather time history"
              aria-label="Weather time history chart"
              aria-pressed={historyOpen}
              onClick={() => onHistoryOpenChange(!historyOpen)}
            >
              <i className="fa-solid fa-chart-line" aria-hidden />
            </button>
            <button
              type="button"
              className="si-map-wx-intel__icon-btn"
              title="Refresh weather"
              aria-label="Refresh weather"
              disabled={loading}
              onClick={() => {
                void loadWeather(pin, selectedDate);
                void loadComparison(pin);
              }}
            >
              <i className={`fa-solid fa-rotate-right${loading ? ' fa-spin' : ''}`} aria-hidden />
            </button>
            <span className="si-map-wx-intel__head-date-wrap">
              <button
                type="button"
                className={`si-map-wx-intel__icon-btn si-map-wx-intel__icon-btn--date${!viewingToday ? ' is-active' : ''}`}
                title={viewingToday ? 'Pick historical date (double-click for today)' : `Historical · ${selectedDate}`}
                aria-label="Pick historical date"
                onClick={openHeadDatePicker}
                onDoubleClick={e => {
                  e.preventDefault();
                  setSelectedDate(wxHistoryOpenMeteoLatestEndDate());
                }}
              >
                <i className="fa-regular fa-calendar" aria-hidden />
              </button>
              <input
                ref={dateInputRef}
                type="date"
                className="si-map-wx-intel__head-date-input"
                value={selectedDate}
                min={OPEN_METEO_HISTORICAL_MIN_DATE}
                max={maxHistoricalDate}
                onChange={e => setSelectedDate(e.target.value)}
                tabIndex={-1}
                aria-hidden
              />
            </span>
            <button type="button" className="si-map-wx-intel__icon-btn" aria-label="Close" onClick={onClose}>
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`si-map-wx-intel__resize-card${resizing ? ' si-map-wx-intel__resize-card--active' : ''}`}
        role="separator"
        aria-orientation="both"
        aria-label="Drag to resize panel freely"
        title="Drag to resize · double-click to reset size"
        onPointerDown={onResizeCardPointerDown}
        onDoubleClick={resetPanelSize}
      >
        <span className="si-map-wx-intel__resize-card-bars" aria-hidden />
      </div>

      <div className="si-map-wx-intel__scroll">
        <div className="si-map-wx-intel__toolbar">
          <form
            className="si-map-wx-intel__toolbar-search"
            onSubmit={e => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <span className="si-map-wx-intel__toolbar-icon" aria-hidden>
              <i className="fa-solid fa-magnifying-glass" />
            </span>
            <input
              type="search"
              className="si-map-wx-intel__toolbar-search-input"
              value={searchDraft}
              onChange={e => setSearchDraft(e.target.value)}
              placeholder="Place or lat,lng"
              aria-label="Search location for weather"
            />
            <button
              type="submit"
              className="si-map-wx-intel__toolbar-go"
              disabled={loading || !searchDraft.trim()}
            >
              Go
            </button>
          </form>
        </div>

        {error ? <p className="si-map-wx-intel__error">{error}</p> : null}

        {loading && !bundle ? (
          <p className="si-map-wx-intel__loading">Loading weather…</p>
        ) : cur ? (
          <div className="si-map-wx-intel__body">
            <div className="si-map-wx-intel__card si-map-wx-intel__card--hero">
              <div className="si-map-wx-intel__current-main">
                <SiWeatherColoredIcon icon={cur.icon} size="hero" className="si-map-wx-intel__wx-icon" />
                <div>
                  <span className="si-map-wx-intel__temp">{formatTemp(cur.tempC)}</span>
                  <p className="si-map-wx-intel__condition">{cur.label}</p>
                  {!viewingToday ? (
                    <span className="si-map-wx-intel__historical-badge">Historical · {selectedDate}</span>
                  ) : null}
                </div>
              </div>
            </div>

            <ul className="si-map-wx-intel__stat-grid" aria-label="Current conditions">
              <li className="si-map-wx-intel__stat-card">
                <SiWeatherColoredIconFromMetric metric="wind" className="si-map-wx-intel__stat-card-icon" />
                <span className="si-map-wx-intel__stat-k">Wind</span>
                <strong>
                  {cur.windKmh != null ? `${cur.windKmh.toFixed(0)} km/h` : '—'}
                  {cur.windDirLabel ? ` ${cur.windDirLabel}` : ''}
                </strong>
              </li>
              <li className="si-map-wx-intel__stat-card">
                <SiWeatherColoredIconFromMetric metric="humidity" className="si-map-wx-intel__stat-card-icon" />
                <span className="si-map-wx-intel__stat-k">Humidity</span>
                <strong>{cur.humidityPct != null ? `${Math.round(cur.humidityPct)}%` : '—'}</strong>
              </li>
              <li className="si-map-wx-intel__stat-card">
                <SiWeatherColoredIconFromMetric metric="precip" className="si-map-wx-intel__stat-card-icon" />
                <span className="si-map-wx-intel__stat-k">Precip.</span>
                <strong>{cur.precipMm != null ? `${cur.precipMm.toFixed(1)} mm` : '—'}</strong>
              </li>
            </ul>

            <SiMapWeatherTemporalComparison
              comparison={comparison}
              comparisonLoading={comparisonLoading}
            />

            {bundle.hourly.length > 0 ? (
              <section className="si-map-wx-intel__card si-map-wx-intel__section">
                <h4>{viewingToday ? 'Next hours' : `Hourly · ${selectedDate}`}</h4>
                <div className="si-map-wx-intel__hourly">
                  {(viewingToday ? bundle.hourly.slice(0, 6) : bundle.hourly).map(h => (
                    <div key={h.time} className="si-map-wx-intel__hour">
                      <time>{h.time.slice(11, 16)}</time>
                      <SiWeatherColoredIcon icon={h.icon} size="sm" className="si-map-wx-intel__hour-icon" />
                      <span>{formatTemp(h.tempC)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {viewingToday && bundle.daily.length > 0 ? (
              <section className="si-map-wx-intel__card si-map-wx-intel__section">
                <h4>7-day forecast</h4>
                <ul className="si-map-wx-intel__daily">
                  {bundle.daily.slice(0, 5).map(d => (
                    <li key={d.date}>
                      <span className="si-map-wx-intel__day">{formatDay(d.date)}</span>
                      <SiWeatherColoredIcon icon={d.icon} size="sm" className="si-map-wx-intel__day-icon" />
                      <span className="si-map-wx-intel__day-temps">
                        {formatTemp(d.tempMaxC)}
                        <span className="si-map-wx-intel__day-lo">{formatTemp(d.tempMinC)}</span>
                      </span>
                      <span className="si-map-wx-intel__day-rain">
                        {d.precipMm != null && d.precipMm > 0.05 ? `${d.precipMm.toFixed(0)} mm` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {historyOpen ? (
          <SiMapWeatherTimeHistoryPanel
            pin={{ lat: pin.lat, lng: pin.lng, name: bundle?.placeName ?? pin.name }}
            theme={theme}
            openWeatherApiKey={openWeatherApiKey}
            onClose={() => onHistoryOpenChange(false)}
            onRefreshLocation={() => {
              void loadWeather(pin, selectedDate);
              void loadComparison(pin);
            }}
            aoiLabel={aoiLabel}
            onUseAoiCenter={aoiCentroid ? useAoiCenter : undefined}
          />
        ) : null}
      </div>

      <footer className="si-map-wx-intel__foot">
        <a href="https://www.geosyntra.org/" target="_blank" rel="noopener noreferrer">
          Data by GeoSyntra
        </a>
      </footer>
      <div
        className="si-map-wx-intel__corner-resize"
        onPointerDown={onCornerResizePointerDown}
        aria-label="Resize panel"
        title="Resize panel"
      />
    </motion.div>
  );
}

export function SiMapWeatherIntelPopup({
  pin,
  mapRef,
  mapLoaded,
  toolboxPanelOpen = false,
  leftFloatingReserve = 0,
  theme,
  onClose,
  onPinChange,
  externalSearchQuery,
  onExternalSearchConsumed,
  openWeatherApiKey = '',
  aoiCentroid = null,
  aoiLabel = null,
}: SiMapWeatherIntelPopupProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!pin) return null;

  return (
    <>
      <Marker longitude={pin.lng} latitude={pin.lat} anchor="center">
        <span className="si-map-wx-intel-pin" aria-hidden />
      </Marker>
      <SiMapWeatherIntelMapHost
        mapRef={mapRef}
        mapLoaded={mapLoaded}
        layoutOpts={{ historyOpen, toolboxPanelOpen, leftFloatingReserve }}
      >
        <SiMapWeatherIntelPopupPanel
          pin={pin}
          mapRef={mapRef}
          theme={theme}
          onClose={onClose}
          onPinChange={onPinChange}
          externalSearchQuery={externalSearchQuery}
          onExternalSearchConsumed={onExternalSearchConsumed}
          openWeatherApiKey={openWeatherApiKey}
          aoiCentroid={aoiCentroid}
          aoiLabel={aoiLabel}
          historyOpen={historyOpen}
          onHistoryOpenChange={setHistoryOpen}
        />
      </SiMapWeatherIntelMapHost>
    </>
  );
}
