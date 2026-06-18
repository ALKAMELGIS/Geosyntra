import { createPortal } from 'react-dom';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  computeSiMapWeatherIntelLayout,
  type SiMapWeatherIntelLayout,
  type SiMapWeatherIntelLayoutOpts,
} from '../utils/siMapWeatherIntelLayout';

export const SiMapWeatherIntelLayoutContext = createContext<SiMapWeatherIntelLayout | null>(null);

export function useSiMapWeatherIntelLayout(): SiMapWeatherIntelLayout | null {
  return useContext(SiMapWeatherIntelLayoutContext);
}

export type SiMapWeatherIntelMapHostProps = {
  mapRef: RefObject<{ getMap?: () => unknown } | null>;
  mapLoaded: boolean;
  layoutOpts?: SiMapWeatherIntelLayoutOpts;
  children: ReactNode;
};

function resolveMapShell(map: { getCanvasContainer?: () => HTMLElement } | null): HTMLElement | null {
  if (!map || typeof map.getCanvasContainer !== 'function') return null;
  const canvasHost = map.getCanvasContainer() as HTMLElement;
  const mapShell = canvasHost.closest('.si-map-container') as HTMLElement | null;
  return mapShell ?? canvasHost;
}

const OVERLAY_SELECTOR = '[data-si-wx-intel-overlay]';

function ensureOverlayRoot(shell: HTMLElement): HTMLElement {
  let root = shell.querySelector(OVERLAY_SELECTOR) as HTMLElement | null;
  if (!root) {
    root = document.createElement('div');
    root.className = 'si-map-wx-intel-overlay';
    root.dataset.siWxIntelOverlay = '';
    shell.appendChild(root);
  }
  return root;
}

/**
 * Anchors weather UI inside the map shell (canvas container ancestor) so the panel
 * stays in the viewport on resize/fullscreen without following map pan/zoom.
 */
export function SiMapWeatherIntelMapHost({
  mapRef,
  mapLoaded,
  layoutOpts,
  children,
}: SiMapWeatherIntelMapHostProps) {
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const [layout, setLayout] = useState<SiMapWeatherIntelLayout | null>(null);

  useLayoutEffect(() => {
    if (!mapLoaded || typeof window === 'undefined') {
      setOverlayRoot(null);
      setLayout(null);
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let shell: HTMLElement | null = null;

    const syncLayout = () => {
      if (cancelled || !shell) return;
      const w = shell.clientWidth;
      const h = shell.clientHeight;
      if (w < 1 || h < 1) return;
      setLayout(computeSiMapWeatherIntelLayout(w, h, layoutOpts));
    };

    const attach = () => {
      if (cancelled) return;
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      const nextShell = resolveMapShell(map as { getCanvasContainer?: () => HTMLElement } | null);
      if (!nextShell) {
        setOverlayRoot(null);
        setLayout(null);
        return;
      }
      if (shell !== nextShell) {
        resizeObserver?.disconnect();
        shell = nextShell;
        resizeObserver = new ResizeObserver(syncLayout);
        resizeObserver.observe(shell);
        window.addEventListener('resize', syncLayout);
      }
      setOverlayRoot(ensureOverlayRoot(shell));
      syncLayout();
    };

    attach();
    const raf = window.requestAnimationFrame(attach);

    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    const onMapChange = () => attach();
    if (map && typeof (map as { on?: (e: string, fn: () => void) => void }).on === 'function') {
      const m = map as { on: (e: string, fn: () => void) => void; off: (e: string, fn: () => void) => void };
      m.on('load', onMapChange);
      m.on('resize', onMapChange);
      m.on('styledata', onMapChange);
    }

    const onFs = () => syncLayout();
    document.addEventListener('fullscreenchange', onFs);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncLayout);
      document.removeEventListener('fullscreenchange', onFs);
      if (map && typeof (map as { off?: (e: string, fn: () => void) => void }).off === 'function') {
        const m = map as { off: (e: string, fn: () => void) => void };
        m.off('load', onMapChange);
        m.off('resize', onMapChange);
        m.off('styledata', onMapChange);
      }
    };
  }, [mapLoaded, mapRef, layoutOpts?.historyOpen, layoutOpts?.toolboxPanelOpen, layoutOpts?.leftFloatingReserve]);

  if (!mapLoaded || !overlayRoot || !layout) return null;

  return createPortal(
    <SiMapWeatherIntelLayoutContext.Provider value={layout}>
      <div className="si-map-wx-intel-overlay">{children}</div>
    </SiMapWeatherIntelLayoutContext.Provider>,
    overlayRoot,
  );
}
