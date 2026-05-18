import type { Map as MapboxMap } from 'mapbox-gl';

export type SiMapProjectionMode = '2d' | 'globe';

export const SI_MAP_PROJECTION_MODE_LS = 'si-map-projection-mode-v1';
export const SI_MAP_TERRAIN_ENABLED_LS = 'si-map-terrain-enabled-v1';
export const SI_MAP_TERRAIN_EXAGGERATION_LS = 'si-map-terrain-exaggeration-v1';

const DEM_SOURCE_ID = 'si-mapbox-terrain-dem';
const BUILDINGS_LAYER_ID = 'si-3d-buildings';

export type SiMapTerrainOptions = {
  enabled: boolean;
  exaggeration?: number;
  buildings?: boolean;
};

function findLabelLayerId(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!;
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) return layer.id;
  }
  return undefined;
}

/** Enable Mapbox terrain DEM, optional building extrusion, and globe fog for 3D mode. */
export function applySiMapTerrain(map: MapboxMap, opts: SiMapTerrainOptions): void {
  const exaggeration = Math.min(3, Math.max(0.5, opts.exaggeration ?? 1.35));

  try {
    if (!opts.enabled) {
      map.setTerrain(null);
      if (map.getLayer(BUILDINGS_LAYER_ID)) map.removeLayer(BUILDINGS_LAYER_ID);
      return;
    }

    if (!map.getSource(DEM_SOURCE_ID)) {
      map.addSource(DEM_SOURCE_ID, {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
    }

    map.setTerrain({ source: DEM_SOURCE_ID, exaggeration });

    try {
      map.setFog({
        range: [0.5, 10],
        color: '#020617',
        'horizon-blend': 0.12,
        'high-color': '#1e293b',
        'space-color': '#020617',
        'star-intensity': 0.35,
      });
    } catch {
      /* optional */
    }

    if (opts.buildings !== false && !map.getLayer(BUILDINGS_LAYER_ID)) {
      const style = map.getStyle();
      const hasComposite = Boolean(style?.sources?.composite);
      if (hasComposite) {
        const beforeId = findLabelLayerId(map);
        map.addLayer(
          {
            id: BUILDINGS_LAYER_ID,
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', ['get', 'extrude'], 'true'],
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': '#94a3b8',
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 12],
              'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.72,
            },
          },
          beforeId,
        );
      }
    }
  } catch (e) {
    console.warn('[siMapProjectionTerrain] apply failed', e);
  }
}

export type SiMapCameraSnapshot = {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
};

export function readSiMapboxProjectionName(map: MapboxMap): string | null {
  try {
    const p = map.getProjection?.()
    if (p && typeof p === 'object' && 'name' in p) {
      return String((p as { name: string }).name)
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Clamp react-map-gl view state so 2D mode never feeds pitch/bearing into a maxPitch=0 map. */
export function clampSiViewStateForProjection<T extends { pitch?: number; bearing?: number }>(
  viewState: T,
  mode: SiMapProjectionMode,
): T {
  if (mode === 'globe') return viewState
  return {
    ...viewState,
    pitch: 0,
    bearing: 0,
  }
}

export function readSiMapCamera(map: MapboxMap): SiMapCameraSnapshot {
  const c = map.getCenter();
  return {
    longitude: c.lng,
    latitude: c.lat,
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

/** Switch 2D/3D projection while preserving center + zoom (smooth camera). */
export function applySiMapProjectionMode(
  map: MapboxMap,
  mode: SiMapProjectionMode,
  camera: SiMapCameraSnapshot,
  terrain: SiMapTerrainOptions,
  opts?: { durationMs?: number },
): SiMapCameraSnapshot {
  const duration = opts?.durationMs ?? 620;
  const isGlobe = mode === 'globe';
  const targetPitch = isGlobe ? Math.max(camera.pitch, 48) : 0;
  const targetBearing = isGlobe ? camera.bearing : 0;
  const wantProjection = isGlobe ? 'globe' : 'mercator';

  try {
    if (readSiMapboxProjectionName(map) !== wantProjection) {
      map.setProjection({ name: wantProjection });
    }
  } catch {
    /* ignore */
  }

  applySiMapTerrain(map, { ...terrain, enabled: isGlobe && terrain.enabled });

  try {
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom: camera.zoom,
      bearing: targetBearing,
      pitch: targetPitch,
      duration,
      essential: true,
    });
  } catch {
    /* ignore */
  }

  return {
    longitude: camera.longitude,
    latitude: camera.latitude,
    zoom: camera.zoom,
    bearing: targetBearing,
    pitch: targetPitch,
  };
}

/** Map canvas is 3D globe only — migrate any legacy 2D preference. */
export function migrateSiMapProjectionToGlobeOnly(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_MAP_PROJECTION_MODE_LS, 'globe');
  } catch {
    /* ignore */
  }
}

export function loadStoredSiMapProjectionMode(): SiMapProjectionMode {
  migrateSiMapProjectionToGlobeOnly();
  return 'globe';
}

export function loadStoredSiTerrainEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(SI_MAP_TERRAIN_ENABLED_LS);
    if (v === '0' || v === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function loadStoredSiTerrainExaggeration(): number {
  if (typeof window === 'undefined') return 1.35;
  try {
    const n = Number(window.localStorage.getItem(SI_MAP_TERRAIN_EXAGGERATION_LS));
    if (Number.isFinite(n)) return Math.min(3, Math.max(0.5, n));
  } catch {
    /* ignore */
  }
  return 1.35;
}
