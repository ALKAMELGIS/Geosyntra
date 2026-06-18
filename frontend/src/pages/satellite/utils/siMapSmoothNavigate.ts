import type { Map as MapboxMap } from 'mapbox-gl';
import { bboxFromFeatureCollection } from '../../../lib/geoAiRoutePlan';
import { readSiMapCamera, type SiMapCameraSnapshot } from './siMapProjectionTerrain';
import { resolveSiMapboxMap } from './siMapRenderSync';

export type SiMapNavigateBounds = [number, number, number, number];

export type SiMapSmoothNavigateOpts = {
  padding?: number;
  duration?: number;
  maxZoom?: number;
  minZoom?: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
};

const DEFAULT_DURATION = 720;
const DEFAULT_PADDING = 64;
const DEFAULT_MAX_ZOOM = 17;

function waitForMapMoveEnd(map: MapboxMap, durationMs: number): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      map.off('moveend', finish);
      resolve();
    };
    map.once('moveend', finish);
    window.setTimeout(finish, durationMs + 400);
  });
}

export function lngLatBoundsFromGeometry(geom: GeoJSON.Geometry | null | undefined): SiMapNavigateBounds | null {
  if (!geom) return null;
  return bboxFromFeatureCollection({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: geom, properties: {} }],
  });
}

export async function siMapSmoothNavigateToBounds(
  mapRef: unknown,
  bounds: SiMapNavigateBounds,
  opts?: SiMapSmoothNavigateOpts,
): Promise<SiMapCameraSnapshot | null> {
  const map = resolveSiMapboxMap(mapRef) as MapboxMap | null;
  if (!map || typeof map.fitBounds !== 'function') return null;
  const duration = opts?.duration ?? DEFAULT_DURATION;
  const padding = opts?.padding ?? DEFAULT_PADDING;
  const maxZoom = opts?.maxZoom ?? DEFAULT_MAX_ZOOM;
  const span = Math.max(Math.abs(bounds[2] - bounds[0]), Math.abs(bounds[3] - bounds[1]));
  const fitMaxZoom = span < 1e-8 ? Math.min(maxZoom, 18) : maxZoom;
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    {
      padding,
      duration,
      maxZoom: fitMaxZoom,
      ...(opts?.minZoom != null ? { minZoom: opts.minZoom } : {}),
    },
  );
  await waitForMapMoveEnd(map, duration);
  return readSiMapCamera(map);
}

export async function siMapSmoothNavigateToLngLat(
  mapRef: unknown,
  lng: number,
  lat: number,
  opts?: SiMapSmoothNavigateOpts,
): Promise<SiMapCameraSnapshot | null> {
  const map = resolveSiMapboxMap(mapRef) as MapboxMap | null;
  if (!map) return null;
  const duration = opts?.duration ?? DEFAULT_DURATION;
  const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 12;
  const zoom = opts?.zoom ?? Math.max(currentZoom, 14);
  if (typeof map.easeTo === 'function') {
    map.easeTo({
      center: [lng, lat],
      zoom,
      duration,
      ...(opts?.pitch != null ? { pitch: opts.pitch } : {}),
      ...(opts?.bearing != null ? { bearing: opts.bearing } : {}),
    });
  } else if (typeof map.jumpTo === 'function') {
    map.jumpTo({ center: [lng, lat], zoom });
    return readSiMapCamera(map);
  } else {
    return null;
  }
  await waitForMapMoveEnd(map, duration);
  return readSiMapCamera(map);
}

export async function siMapSmoothNavigateToGeometry(
  mapRef: unknown,
  geometry: GeoJSON.Geometry,
  opts?: SiMapSmoothNavigateOpts,
): Promise<SiMapCameraSnapshot | null> {
  if (geometry.type === 'Point') {
    const c = geometry.coordinates as [number, number];
    return siMapSmoothNavigateToLngLat(mapRef, c[0]!, c[1]!, opts);
  }
  const bounds = lngLatBoundsFromGeometry(geometry);
  if (!bounds) return null;
  return siMapSmoothNavigateToBounds(mapRef, bounds, opts);
}
