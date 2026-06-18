import type { Map as MapboxMap } from 'mapbox-gl';
import {
  applySiElevationView,
  applySiMapTerrain,
  readSiMapCamera,
  readSiMapboxProjectionName,
  type SiMapCameraSnapshot,
  type SiMapTerrainSettings,
} from './siMapProjectionTerrain';

/** Minimum map zoom so global I3S building tiles stream in urban areas. */
export const SI_3D_BUILDINGS_MIN_MAP_ZOOM = 15;

/** Minimum zoom for Google Photorealistic 3D mesh (urban coverage). */
export const SI_GOOGLE_PHOTOREALISTIC_MIN_MAP_ZOOM = 16;

/** Target pitch when entering Google Photorealistic 3D basemap. */
export const SI_GOOGLE_PHOTOREALISTIC_VIEW_PITCH = 60;

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

/** Globe + pitched camera for Google Photorealistic 3D — no Mapbox DEM (mesh is the surface). */
export function applySiMapGooglePhotorealistic3dBasemapView(
  map: MapboxMap,
  opts?: { durationMs?: number },
): SiMapCameraSnapshot {
  applySiMapTerrain(map, { enabled: false, buildings: false });
  const camera = readSiMapCamera(map);
  const zoom = Math.max(camera.zoom, SI_GOOGLE_PHOTOREALISTIC_MIN_MAP_ZOOM);
  const pitch = Math.max(camera.pitch, SI_GOOGLE_PHOTOREALISTIC_VIEW_PITCH);

  try {
    if (readSiMapboxProjectionName(map) !== 'globe') {
      map.setProjection({ name: 'globe' });
    }
  } catch {
    /* ignore */
  }

  const duration = opts?.durationMs ?? 680;
  try {
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom,
      bearing: camera.bearing,
      pitch,
      duration,
      essential: true,
    });
  } catch {
    /* ignore */
  }

  return { ...camera, zoom, pitch };
}
