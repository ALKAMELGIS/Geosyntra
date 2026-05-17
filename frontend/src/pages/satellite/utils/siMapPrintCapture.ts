import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapRef } from 'react-map-gl/mapbox';
import { captureMapboxCanvasWhenReady } from './siMapViewerSnapshot';
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
 */
export async function captureSiMapPrintSnapshot(opts: {
  mapRef: MapRef | null | undefined;
  mapLoaded: boolean;
  extent: SiMapPrintExtent;
  aoiFitBounds: [[number, number], [number, number]] | null;
  scale?: 2 | 3;
}): Promise<string | null> {
  const map = opts.mapRef?.getMap?.();
  if (!map || !opts.mapLoaded) return null;

  const scale = opts.scale ?? 2;
  const prior = readView(map);
  const useAoi = opts.extent === 'aoi' && opts.aoiFitBounds;

  if (useAoi) {
    try {
      map.fitBounds(opts.aoiFitBounds!, { padding: 48, duration: 0, maxZoom: 16 });
    } catch {
      /* ignore */
    }
  }

  try {
    return await captureMapboxCanvasWhenReady(map, {
      scale,
      idlePasses: 2,
      idleTimeoutMs: 10000,
      tilesTimeoutMs: 6000,
    });
  } finally {
    if (useAoi) restoreView(map, prior);
  }
}
