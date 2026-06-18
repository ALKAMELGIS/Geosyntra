import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapRef } from 'react-map-gl/mapbox';
import { captureMapboxCanvasWhenReady } from './siMapViewerSnapshot';
import type { SiMapPrintBasemapMode } from './siMapPrintBasemap';
import type { SiMapPrintExtent } from './siMapPrintTypes';

type ViewSnap = {
  center: { lng: number; lat: number };
  zoom: number;
  bearing: number;
  pitch: number;
};

function readView(map: MapboxMap): ViewSnap {
  const c = map.getCenter();
  return {
    center: { lng: c.lng, lat: c.lat },
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

function restoreView(map: MapboxMap, v: ViewSnap) {
  try {
    map.jumpTo({
      center: [v.center.lng, v.center.lat],
      zoom: v.zoom,
      bearing: v.bearing,
      pitch: v.pitch,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Hi-res PNG from the live Mapbox viewer. Optionally fits AOI bounds before capture.
 * Caller supplies prepare/restore to switch basemap mode without reloading overlay sources.
 */
export async function captureSiMapPrintSnapshot(opts: {
  mapRef: MapRef | null | undefined;
  mapLoaded: boolean;
  extent: SiMapPrintExtent;
  aoiFitBounds: [[number, number], [number, number]] | null;
  basemapMode: SiMapPrintBasemapMode;
  scale?: 1 | 2 | 3;
  /** Shorter idle waits for live preview (scale 1). */
  fastCapture?: boolean;
  prepareBasemap?: (mode: SiMapPrintBasemapMode) => Promise<void>;
  restoreBasemap?: () => Promise<void>;
}): Promise<string | null> {
  const map = opts.mapRef?.getMap?.();
  if (!map || !opts.mapLoaded) return null;

  const scale = opts.scale ?? 2;
  const fast = opts.fastCapture ?? scale <= 1;
  const prior = readView(map);
  const useAoi = opts.extent === 'aoi' && opts.aoiFitBounds;

  if (useAoi) {
    try {
      map.fitBounds(opts.aoiFitBounds!, {
        padding: { top: 28, bottom: 28, left: 28, right: 28 },
        duration: 0,
        maxZoom: 17,
      });
    } catch {
      /* ignore */
    }
  }

  try {
    await opts.prepareBasemap?.(opts.basemapMode);
    return await captureMapboxCanvasWhenReady(map, {
      scale,
      idlePasses: fast ? 1 : 2,
      idleTimeoutMs: fast ? 5200 : 12000,
      tilesTimeoutMs: fast ? 3800 : 8000,
    });
  } finally {
    await opts.restoreBasemap?.();
    if (useAoi) restoreView(map, prior);
  }
}
