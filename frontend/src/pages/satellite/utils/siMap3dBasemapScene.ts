import type { Map as MapboxMap } from 'mapbox-gl';
import {
  applySiElevationView,
  readSiMapCamera,
  type SiMapCameraSnapshot,
  type SiMapTerrainSettings,
} from './siMapProjectionTerrain';

/** Minimum map zoom so global I3S building tiles stream in urban areas. */
export const SI_3D_BUILDINGS_MIN_MAP_ZOOM = 15;

/** Engage globe + terrain pitch so Esri/OSM I3S building meshes are visible (Scene View). */
export function applySiMap3dBuildingsBasemapView(
  map: MapboxMap,
  terrain: SiMapTerrainSettings,
  opts?: { durationMs?: number },
): SiMapCameraSnapshot {
  const camera = readSiMapCamera(map);
  const zoom = Math.max(camera.zoom, SI_3D_BUILDINGS_MIN_MAP_ZOOM);
  return applySiElevationView(
    map,
    true,
    { ...camera, zoom },
    { ...terrain, buildings: false },
    opts,
  );
}
