import { createPortal } from 'react-dom';
import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

export type MapToolsDockProps = {
  /** react-map-gl ref — `ref.current.getMap()` returns the Mapbox `Map` instance. */
  mapRef: RefObject<any>;
  mapLoaded: boolean;
  children: ReactNode;
};

/**
 * Renders children inside `.si-map-container` (fallback: map canvas container) so the toolbox
 * stacks above map-only overlays (layer swipe, legends) while pan/zoom still hit the WebGL canvas.
 *
 * The host uses `pointer-events: none` so map interaction passes through; tool UI opts in with `pointer-events: auto`.
 */
function resolveMapToolsPortalShell(map: {
  getCanvasContainer?: () => HTMLElement;
} | null): HTMLElement | null {
  if (!map || typeof map.getCanvasContainer !== 'function') return null;
  const canvasHost = map.getCanvasContainer() as HTMLElement;
  const mapShell = canvasHost.closest('.si-map-container') as HTMLElement | null;
  return mapShell ?? canvasHost;
}

function rectToHostStyle(rect: DOMRect): CSSProperties {
  return {
    position: 'fixed',
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    zIndex: 96,
  };
}

export function MapToolsDock({ mapRef, mapLoaded, children }: MapToolsDockProps) {
  const [anchorShell, setAnchorShell] = useState<HTMLElement | null>(null);
  const [hostStyle, setHostStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!mapLoaded || typeof window === 'undefined') {
      setAnchorShell(null);
      setHostStyle(null);
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let shell: HTMLElement | null = null;

    const syncHostRect = () => {
      if (cancelled || !shell) return;
      setHostStyle(rectToHostStyle(shell.getBoundingClientRect()));
    };

    const attach = () => {
      if (cancelled) return;
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      const nextShell = resolveMapToolsPortalShell(map ?? null);
      if (!nextShell) {
        setAnchorShell(null);
        setHostStyle(null);
        return;
      }
      if (shell !== nextShell) {
        resizeObserver?.disconnect();
        shell = nextShell;
        resizeObserver = new ResizeObserver(syncHostRect);
        resizeObserver.observe(shell);
        window.addEventListener('scroll', syncHostRect, true);
        window.addEventListener('resize', syncHostRect);
      }
      setAnchorShell(shell);
      syncHostRect();
    };

    attach();
    const raf = window.requestAnimationFrame(attach);

    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    const onReady = () => attach();
    if (map && typeof map.on === 'function') {
      map.on('load', onReady);
      map.on('styledata', onReady);
      map.on('resize', onReady);
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', syncHostRect, true);
      window.removeEventListener('resize', syncHostRect);
      if (map && typeof map.off === 'function') {
        map.off('load', onReady);
        map.off('styledata', onReady);
        map.off('resize', onReady);
      }
    };
  }, [mapLoaded, mapRef]);

  if (!mapLoaded || !anchorShell || !hostStyle) return null;

  return createPortal(
    <div
      className="si-map-tools-dock-host si-map-tools-dock-host--viewport-anchored"
      data-si-map-tools-dock=""
      role="presentation"
      style={hostStyle}
    >
      {children}
    </div>,
    document.body,
  );
}
