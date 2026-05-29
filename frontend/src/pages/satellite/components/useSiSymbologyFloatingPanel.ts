import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { readMapCanvasLayout } from '../utils/siMapFloatingPanelLayout';
import './SiSymbologyFloatingPanel.css';

/** Left-docked symbology studio — map stays visible; panel hugs the leading map edge. */
export function useSiSymbologyFloatingPanel(enabled: boolean) {
  const panelRef = useRef<HTMLDivElement | null>(null);

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
    const el = panelRef.current;
    if (el) {
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.margin = '';
    }
  }, [enabled, syncHostInset]);

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => syncHostInset();
    window.addEventListener('resize', onResize);
    const mapEl = document.querySelector('.si-map-container');
    const ro =
      mapEl && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncHostInset())
        : null;
    if (mapEl && ro) ro.observe(mapEl);
    const dock = mapEl?.querySelector('.si-sat-ctx-dock--map');
    if (dock && ro) ro.observe(dock);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [enabled, syncHostInset]);

  return { panelRef, onHeaderPointerDown: undefined };
}
