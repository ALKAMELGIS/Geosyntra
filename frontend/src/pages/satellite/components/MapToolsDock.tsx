import { createPortal } from 'react-dom';

import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';



export type MapToolsDockProps = {

  /** react-map-gl ref — `ref.current.getMap()` returns the Mapbox `Map` instance. */

  mapRef: RefObject<any>;

  mapLoaded: boolean;

  children: ReactNode;

};



export type MapToolboxHostMetrics = {

  top: number;

  height: number;

  gapBridge: number;

};



const MAP_TOOLBOX_PAGE_ATTR = 'data-si-map-toolbox-page';

const MAP_TOOLBOX_SPINE_W_VAR = '--si-map-toolbox-spine-w';

const DEFAULT_SPINE_W_PX = 38;



/**

 * Renders children inside `.si-map-container` (fallback: map canvas container) so the toolbox

 * stacks above map-only overlays (legends) while pan/zoom still hit the WebGL canvas.

 *

 * On map-canvas pages the host is always portaled to `document.body` and fixed from app chrome

 * bottom to the viewport foot so the trailing glass spine never gaps under the header.

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



function resolveMapShellElement(mapLoaded: boolean, mapRef: RefObject<any>): HTMLElement | null {

  if (mapLoaded) {

    const map = mapRef.current?.getMap?.() ?? mapRef.current;

    const fromMap = resolveMapToolsPortalShell(map ?? null);

    if (fromMap) return fromMap;

  }

  return document.querySelector('.si-map-container') as HTMLElement | null;

}



export function isMapCanvasPage(): boolean {

  if (typeof document === 'undefined') return false;

  return !!document.querySelector('.si-page.si-page--map-canvas');

}



/** Bottom edge of fixed app chrome (env banner + header) in viewport px. */

export function resolveAppChromeBottomPx(): number | null {

  if (typeof document === 'undefined') return null;



  let bottom = 0;

  const banner = document.querySelector('.platform-env-banner') as HTMLElement | null;

  if (banner) {

    const bannerBottom = banner.getBoundingClientRect().bottom;

    if (Number.isFinite(bannerBottom)) bottom = Math.max(bottom, bannerBottom);

  }



  const header = document.querySelector('.geosyntra-header') as HTMLElement | null;

  if (!header || header.classList.contains('geosyntra-header--bottom-cloud')) {

    return bottom > 0 ? bottom : null;

  }



  const headerBottom = header.getBoundingClientRect().bottom;

  if (!Number.isFinite(headerBottom) || headerBottom <= 0) {

    return bottom > 0 ? bottom : null;

  }



  return Math.max(bottom, headerBottom);

}



/**

 * Toolbox rail hugs the app header — not the map shell top (which can sit below a horizontal nav strip).

 */

export function resolveMapToolboxHostTopPx(rect: DOMRect): number {

  if (!isMapCanvasPage()) return Math.round(rect.top);



  const chromeBottom = resolveAppChromeBottomPx();

  if (chromeBottom == null) return Math.round(rect.top);



  return Math.round(chromeBottom);

}



export function resolveMapToolboxGapBridgePx(rect: DOMRect, hostTop: number): number {

  if (!isMapCanvasPage()) return 0;



  const chromeBottom = resolveAppChromeBottomPx();

  if (chromeBottom == null) return 0;



  return Math.max(0, Math.round(rect.top) - Math.round(chromeBottom));

}



export function resolveMapToolboxHostHeightPx(rect: DOMRect, top: number): number {

  const vv = typeof window !== 'undefined' ? window.visualViewport : null;

  const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;

  const bottom = Math.max(rect.bottom, viewportBottom);

  return Math.max(0, Math.round(bottom) - top);

}



export function measureMapToolboxHostMetrics(rect: DOMRect): MapToolboxHostMetrics {

  const top = resolveMapToolboxHostTopPx(rect);

  const gapBridge = resolveMapToolboxGapBridgePx(rect, top);

  const height = resolveMapToolboxHostHeightPx(rect, top);

  return { top, height, gapBridge };

}



export function syncMapToolboxSpineWidthPx(widthPx: number) {

  if (typeof document === 'undefined') return;

  const width = Math.max(0, Math.round(widthPx));

  if (width <= 0) return;

  document.documentElement.style.setProperty(MAP_TOOLBOX_SPINE_W_VAR, `${width}px`);

}



export function syncMapToolboxCssVars(metrics: MapToolboxHostMetrics) {

  const root = document.documentElement;

  root.style.setProperty('--si-map-toolbox-sync-top', `${metrics.top}px`);

  root.style.setProperty('--si-map-toolbox-sync-height', `${metrics.height}px`);

  root.style.setProperty('--si-map-toolbox-gap-bridge', `${metrics.gapBridge}px`);

  root.style.setProperty('--si-map-toolbox-top', `${metrics.top}px`);

}



export function clearMapToolboxCssVars() {

  const root = document.documentElement;

  root.style.removeProperty('--si-map-toolbox-sync-top');

  root.style.removeProperty('--si-map-toolbox-sync-height');

  root.style.removeProperty('--si-map-toolbox-gap-bridge');

  root.style.removeProperty('--si-map-toolbox-top');

  root.style.removeProperty(MAP_TOOLBOX_SPINE_W_VAR);

}



function measureToolboxRailWidthPx(): number {

  const rail = document.querySelector(

    '[data-si-map-tools-dock] .si-sat-ctx-dock--map-toolbox .si-sat-ctx-rail',

  ) as HTMLElement | null;

  if (!rail) return DEFAULT_SPINE_W_PX;

  const width = rail.getBoundingClientRect().width;

  return width > 0 ? Math.round(width) : DEFAULT_SPINE_W_PX;

}



function buildMapCanvasHostStyle(shellRect: DOMRect | null): CSSProperties | null {

  const chromeBottom = resolveAppChromeBottomPx();

  if (chromeBottom == null) return null;



  const rect =

    shellRect ??

    ({

      top: chromeBottom,

      bottom: window.innerHeight,

      left: 0,

      width: window.innerWidth,

      right: window.innerWidth,

      height: window.innerHeight - chromeBottom,

      x: 0,

      y: chromeBottom,

      toJSON: () => ({}),

    } as DOMRect);



  const metrics = measureMapToolboxHostMetrics(rect);

  syncMapToolboxCssVars(metrics);

  syncMapToolboxSpineWidthPx(measureToolboxRailWidthPx());



  if (shellRect) {

    return {

      position: 'fixed',

      top: metrics.top,

      insetInlineEnd: 0,

      insetInlineStart: 'auto',

      margin: 0,

      padding: 0,

      width: 'max-content',

      maxWidth: Math.round(shellRect.width),

      height: 'auto',

      zIndex: 96,

      pointerEvents: 'none',

      overflow: 'visible',

    };

  }



    return {

      position: 'fixed',

      top: metrics.top,

      insetInlineEnd: 0,

      insetInlineStart: 'auto',

      margin: 0,

      padding: 0,

      width: 'max-content',

      maxWidth: '100vw',

      height: 'auto',

      zIndex: 96,

      pointerEvents: 'none',

      overflow: 'visible',

    };

}



function attachChromeObservers(onSync: () => void): () => void {

  const targets: Element[] = [];

  const header = document.querySelector('.geosyntra-header');

  if (header) targets.push(header);

  const banner = document.querySelector('.platform-env-banner');

  if (banner) targets.push(banner);

  const nav = document.querySelector('.navmenu');

  if (nav) targets.push(nav);



  const resizeObserver = targets.length ? new ResizeObserver(onSync) : null;

  for (const target of targets) resizeObserver?.observe(target);



  window.visualViewport?.addEventListener('resize', onSync);

  window.visualViewport?.addEventListener('scroll', onSync);

  window.addEventListener('scroll', onSync, true);

  window.addEventListener('resize', onSync);



  return () => {

    resizeObserver?.disconnect();

    window.visualViewport?.removeEventListener('resize', onSync);

    window.visualViewport?.removeEventListener('scroll', onSync);

    window.removeEventListener('scroll', onSync, true);

    window.removeEventListener('resize', onSync);

  };

}



function setMapToolboxPageActive(active: boolean) {

  if (typeof document === 'undefined') return;

  if (active) {

    document.documentElement.setAttribute(MAP_TOOLBOX_PAGE_ATTR, '');

  } else {

    document.documentElement.removeAttribute(MAP_TOOLBOX_PAGE_ATTR);

  }

}



export function MapToolsDock({ mapRef, mapLoaded, children }: MapToolsDockProps) {

  const [anchorShell, setAnchorShell] = useState<HTMLElement | null>(null);

  const [hostStyle, setHostStyle] = useState<CSSProperties | null>(null);



  useLayoutEffect(() => {

    if (typeof window === 'undefined' || !isMapCanvasPage()) return;



    setMapToolboxPageActive(true);

    return () => setMapToolboxPageActive(false);

  }, []);



  useLayoutEffect(() => {

    if (typeof window === 'undefined') {

      setAnchorShell(null);

      setHostStyle(null);

      return;

    }



    const onMapCanvas = isMapCanvasPage();



    if (!onMapCanvas) {

      if (!mapLoaded) {

        setAnchorShell(null);

        setHostStyle(null);

        return;

      }



      let cancelled = false;

      let resizeObserver: ResizeObserver | null = null;

      let shell: HTMLElement | null = null;



      const syncInlineHost = () => {

        if (cancelled || !shell) return;

        setHostStyle({

          position: 'absolute',

          inset: 0,

          zIndex: 96,

          pointerEvents: 'none',

        });

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

          resizeObserver = new ResizeObserver(syncInlineHost);

          resizeObserver.observe(shell);

        }

        setAnchorShell(null);

        syncInlineHost();

      };



      attach();

      const map = mapRef.current?.getMap?.() ?? mapRef.current;

      const onReady = () => attach();

      if (map && typeof map.on === 'function') {

        map.on('load', onReady);

        map.on('styledata', onReady);

        map.on('resize', onReady);

      }



      return () => {

        cancelled = true;

        resizeObserver?.disconnect();

        if (map && typeof map.off === 'function') {

          map.off('load', onReady);

          map.off('styledata', onReady);

          map.off('resize', onReady);

        }

      };

    }



    let cancelled = false;

    let shellObserver: ResizeObserver | null = null;

    let railObserver: ResizeObserver | null = null;

    let shell: HTMLElement | null = null;



    const syncPortaledHost = () => {

      if (cancelled) return;



      const chromeBottom = resolveAppChromeBottomPx();

      if (chromeBottom == null) {

        clearMapToolboxCssVars();

        setAnchorShell(null);

        setHostStyle(null);

        return;

      }



      shell = resolveMapShellElement(mapLoaded, mapRef);

      const shellRect = shell?.getBoundingClientRect() ?? null;

      const nextStyle = buildMapCanvasHostStyle(shellRect);

      if (!nextStyle) {

        clearMapToolboxCssVars();

        setAnchorShell(null);

        setHostStyle(null);

        return;

      }



      setAnchorShell(document.body);

      setHostStyle(nextStyle);

      syncMapToolboxSpineWidthPx(measureToolboxRailWidthPx());

    };



    const attachShellObserver = () => {

      const nextShell = resolveMapShellElement(mapLoaded, mapRef);

      if (nextShell === shell) return;

      shellObserver?.disconnect();

      shell = nextShell;

      if (shell) {

        shellObserver = new ResizeObserver(syncPortaledHost);

        shellObserver.observe(shell);

      }

    };



    const attachRailObserver = () => {

      const rail = document.querySelector(

        '[data-si-map-tools-dock] .si-sat-ctx-dock--map-toolbox .si-sat-ctx-rail',

      ) as HTMLElement | null;

      if (!rail) return;

      railObserver?.disconnect();

      railObserver = new ResizeObserver(() => {

        syncMapToolboxSpineWidthPx(measureToolboxRailWidthPx());

      });

      railObserver.observe(rail);

    };



    syncPortaledHost();

    attachShellObserver();

    attachRailObserver();



    const detachChrome = attachChromeObservers(() => {

      syncPortaledHost();

      attachShellObserver();

    });



    const raf = window.requestAnimationFrame(() => {

      syncPortaledHost();

      attachShellObserver();

      attachRailObserver();

    });



    const map = mapRef.current?.getMap?.() ?? mapRef.current;

    const onMapReady = () => {

      syncPortaledHost();

      attachShellObserver();

      attachRailObserver();

    };

    if (mapLoaded && map && typeof map.on === 'function') {

      map.on('load', onMapReady);

      map.on('styledata', onMapReady);

      map.on('resize', onMapReady);

    }



    return () => {

      cancelled = true;

      window.cancelAnimationFrame(raf);

      shellObserver?.disconnect();

      railObserver?.disconnect();

      detachChrome();

      clearMapToolboxCssVars();

      if (map && typeof map.off === 'function') {

        map.off('load', onMapReady);

        map.off('styledata', onMapReady);

        map.off('resize', onMapReady);

      }

    };

  }, [mapLoaded, mapRef]);



  const host = (

    <div

      className={

        'si-map-tools-dock-host' +

        (hostStyle?.position === 'fixed' ? ' si-map-tools-dock-host--viewport-anchored' : '')

      }

      data-si-map-tools-dock=""

      role="presentation"

      style={

        hostStyle ?? {

          position: 'absolute',

          inset: 0,

          zIndex: 96,

          pointerEvents: 'none',

        }

      }

    >

      {children}

    </div>

  );



  if (anchorShell && hostStyle?.position === 'fixed') {

    return createPortal(host, anchorShell);

  }



  if (isMapCanvasPage()) {

    return null;

  }



  if (!mapLoaded) return null;



  return host;

}

