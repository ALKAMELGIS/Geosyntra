import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clampFixedPanelPosition,
  readMapCanvasLayout,
} from '../utils/siMapFloatingPanelLayout';
import './SiSymbologyFloatingPanel.css';

const PANEL_W_DEFAULT = 380;
const PANEL_H_DEFAULT = 720;
const PANEL_W_MIN = 300;
const PANEL_W_MAX = 520;
const PANEL_H_MIN = 360;
const STORAGE_KEY = 'si-sym-float-panel-geom';

type PanelGeom = { left: number; top: number; width: number; height: number };

function readStoredGeom(): Partial<PanelGeom> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelGeom>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function storeGeom(geom: PanelGeom) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(geom));
  } catch {
    /* ignore quota */
  }
}

function maxPanelHeight(): number {
  const layout = readMapCanvasLayout();
  const pad = 16;
  const viewportCap =
    typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.94) - pad * 2 : 900;
  if (!layout) return Math.min(PANEL_H_DEFAULT, viewportCap);
  return Math.min(Math.floor(layout.mapR.height - pad * 2), viewportCap, 960);
}

function maxPanelWidth(): number {
  const layout = readMapCanvasLayout();
  const pad = 16;
  if (!layout) return PANEL_W_MAX;
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const avail = layout.mapR.width - layout.dockW - pad * 2 - (rtl ? 0 : 0);
  return Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, Math.floor(avail)));
}

function clampPanelSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(PANEL_W_MIN, Math.min(maxPanelWidth(), Math.round(width))),
    height: Math.max(PANEL_H_MIN, Math.min(maxPanelHeight(), Math.round(height))),
  };
}

function defaultPanelGeom(): PanelGeom {
  const layout = readMapCanvasLayout();
  const pad = 16;
  const stored = readStoredGeom();
  const width = clampPanelSize(stored?.width ?? PANEL_W_DEFAULT, PANEL_H_DEFAULT).width;
  const height = clampPanelSize(width, stored?.height ?? maxPanelHeight()).height;

  if (!layout) {
    return {
      left: stored?.left ?? pad,
      top: stored?.top ?? 72,
      width,
      height,
    };
  }

  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const top = stored?.top ?? layout.mapR.top + pad;
  let left = stored?.left;
  if (left == null) {
    if (rtl) {
      left = layout.mapR.right - layout.dockW - pad - width;
    } else {
      left = layout.mapR.left + pad;
    }
  }

  const clamped = clampFixedPanelPosition(left, top, width, height);
  return { ...clamped, width, height };
}

/** Floating symbology / labels studio — draggable (header + layer bar), resizable. */
export function useSiSymbologyFloatingPanel(enabled: boolean) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const geomRef = useRef<PanelGeom>(defaultPanelGeom());
  const dragRafRef = useRef<number | null>(null);
  const dragPendingRef = useRef<{ left: number; top: number } | null>(null);

  const applyPanelGeom = useCallback((geom: PanelGeom) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.position = 'fixed';
    el.style.left = `${geom.left}px`;
    el.style.top = `${geom.top}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.margin = '0';
    el.style.width = `${geom.width}px`;
    el.style.height = `${geom.height}px`;
    el.style.setProperty('--si-sym-panel-w', `${geom.width}px`);
    el.style.setProperty('--si-sym-panel-h', `${geom.height}px`);
    el.classList.add('si-sym-float-panel--sized');
  }, []);

  const syncHostInset = useCallback(() => {
    const el = panelRef.current;
    const host = el?.closest('.si-sym-float-host');
    if (!(host instanceof HTMLElement)) return;
    const layout = readMapCanvasLayout();
    const pad = 16;
    host.style.setProperty('--si-map-trailing-dock', `${layout?.dockW ?? 0}px`);
    host.style.setProperty(
      '--si-map-leading-edge',
      layout ? `${layout.mapR.left + pad}px` : `${pad}px`,
    );
  }, []);

  const syncAndApply = useCallback(() => {
    syncHostInset();
    const next = defaultPanelGeom();
    geomRef.current = next;
    applyPanelGeom(next);
  }, [syncHostInset, applyPanelGeom]);

  useLayoutEffect(() => {
    if (!enabled) return;
    syncAndApply();
  }, [enabled, syncAndApply]);

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => {
      syncHostInset();
      const el = panelRef.current;
      if (!el || el.style.position !== 'fixed') return;
      const { width, height, left, top } = geomRef.current;
      const size = clampPanelSize(width, height);
      const clamped = clampFixedPanelPosition(left, top, size.width, size.height);
      const next = { ...size, ...clamped };
      geomRef.current = next;
      applyPanelGeom(next);
      storeGeom(next);
    };
    window.addEventListener('resize', onResize);
    const mapEl = document.querySelector('.si-map-container');
    const ro =
      mapEl && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => onResize())
        : null;
    if (mapEl && ro) ro.observe(mapEl);
    const dock = mapEl?.querySelector('.si-sat-ctx-dock--map');
    if (dock && ro) ro.observe(dock);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [enabled, syncHostInset, applyPanelGeom]);

  const onDragPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, label, a, select')) return;
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const geom = {
        ...geomRef.current,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      geomRef.current = geom;
      applyPanelGeom(geom);
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { left: geom.left, top: geom.top };
      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();

      const flushDrag = () => {
        dragRafRef.current = null;
        const p = dragPendingRef.current;
        if (!p) return;
        applyPanelGeom({ ...geomRef.current, ...p });
      };

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const next = clampFixedPanelPosition(
          origin.left + dx,
          origin.top + dy,
          geomRef.current.width,
          geomRef.current.height,
        );
        geomRef.current = { ...geomRef.current, ...next };
        dragPendingRef.current = next;
        if (dragRafRef.current == null) {
          dragRafRef.current = requestAnimationFrame(flushDrag);
        }
      };

      const onUp = () => {
        if (dragRafRef.current != null) cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
        dragPendingRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        storeGeom(geomRef.current);
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [applyPanelGeom],
  );

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = panelRef.current;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...geomRef.current };
      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const size = clampPanelSize(origin.width + dx, origin.height + dy);
        const clamped = clampFixedPanelPosition(origin.left, origin.top, size.width, size.height);
        const next = { ...origin, ...size, ...clamped };
        geomRef.current = next;
        applyPanelGeom(next);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        storeGeom(geomRef.current);
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [applyPanelGeom],
  );

  return {
    panelRef,
    onHeaderPointerDown: onDragPointerDown,
    onLayerBarPointerDown: onDragPointerDown,
    onResizePointerDown,
  };
}
