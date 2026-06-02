import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clampFixedPanelPosition,
  readMapCanvasLayout,
} from '../utils/siMapFloatingPanelLayout';
import './SiSymbologyFloatingPanel.css';

const PANEL_W = 272;
const PANEL_H = 380;

/** Floating symbology / labels studio — docked by default, draggable by header. */
export function useSiSymbologyFloatingPanel(enabled: boolean) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef({ left: 0, top: 0 });
  const dragRafRef = useRef<number | null>(null);
  const dragPendingRef = useRef<{ left: number; top: number } | null>(null);

  const applyPanelPos = useCallback((left: number, top: number) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.position = 'fixed';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.margin = '0';
  }, []);

  const defaultPanelPos = useCallback(() => {
    const layout = readMapCanvasLayout();
    const pad = 16;
    if (!layout) return { left: pad, top: 72 };
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const top = layout.mapR.top + pad;
    if (rtl) {
      const left = layout.mapR.right - layout.dockW - pad - PANEL_W;
      return { left: Math.max(layout.mapR.left + pad, left), top };
    }
    return { left: layout.mapR.left + pad, top };
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

  useLayoutEffect(() => {
    if (!enabled) return;
    syncHostInset();
    const next = defaultPanelPos();
    posRef.current = next;
    applyPanelPos(next.left, next.top);
  }, [enabled, syncHostInset, defaultPanelPos, applyPanelPos]);

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => {
      syncHostInset();
      const el = panelRef.current;
      if (!el || el.style.position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      const clamped = clampFixedPanelPosition(posRef.current.left, posRef.current.top, r.width, r.height);
      posRef.current = clamped;
      applyPanelPos(clamped.left, clamped.top);
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
  }, [enabled, syncHostInset, applyPanelPos]);

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, label, a, select')) return;
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      posRef.current = { left: rect.left, top: rect.top };
      applyPanelPos(rect.left, rect.top);
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...posRef.current };
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
        applyPanelPos(p.left, p.top);
      };

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const w = el.offsetWidth || PANEL_W;
        const h = el.offsetHeight || PANEL_H;
        const next = clampFixedPanelPosition(origin.left + dx, origin.top + dy, w, h);
        posRef.current = next;
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
    [applyPanelPos],
  );

  return { panelRef, onHeaderPointerDown };
}
