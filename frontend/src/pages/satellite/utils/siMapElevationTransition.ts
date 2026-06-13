import type { Map as MapboxMap } from 'mapbox-gl';
import { applySiGlobeFogNoHalo } from './siMapWeatherEffects';
import {
  SI_ELEVATION_VIEW_PITCH,
  SI_MAPBOX_TERRAIN_DEM_SOURCE_ID,
  applySiMapTerrain,
  clampElevationPitch,
  SI_TERRAIN_EXAGGERATION_MAX,
  SI_TERRAIN_EXAGGERATION_MIN,
  configureSiMapScrollZoomForElevation,
  readSiMapboxProjectionName,
  siElevationPitchScreenOffset,
  type SiMapCameraSnapshot,
  type SiMapTerrainSettings,
} from './siMapProjectionTerrain';

export type SiElevationTransitionProgress = {
  /** Normalized 0–1 along the transition curve. */
  t: number;
  pitch: number;
  terrainExaggeration: number;
};

export type SiElevationTransitionHandle = {
  cancel: () => void;
};

const siElevationSceneWarmed = new WeakMap<MapboxMap, boolean>();
const siElevationSceneDeepWarmed = new WeakMap<MapboxMap, boolean>();
const siActiveElevationTransition = new WeakMap<MapboxMap, () => void>();

function clampTerrainExaggeration(n: number): number {
  return Math.min(SI_TERRAIN_EXAGGERATION_MAX, Math.max(SI_TERRAIN_EXAGGERATION_MIN, n));
}

/** Ease-in-out cubic — smooth start/end without a perceptible “snap”. */
export function siElevationTransitionEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Crossfade veil strength (0–1) peaks mid-transition for a soft blend. */
export function siElevationCrossfadeOpacity(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return Math.sin(x * Math.PI) * 0.14;
}

function ensureSiMapTerrainDemSource(map: MapboxMap): void {
  if (map.getSource(SI_MAPBOX_TERRAIN_DEM_SOURCE_ID)) return;
  map.addSource(SI_MAPBOX_TERRAIN_DEM_SOURCE_ID, {
    type: 'raster-dem',
    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
    tileSize: 512,
    maxzoom: 14,
  });
}

function readTerrainExaggeration(map: MapboxMap): number {
  try {
    const terrain = map.getTerrain?.();
    if (terrain && typeof terrain.exaggeration === 'number' && Number.isFinite(terrain.exaggeration)) {
      return terrain.exaggeration;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function prepSiMapElevationScene(map: MapboxMap, enable: boolean): void {
  if (enable) {
    warmSiMapElevationScene(map);
  }
  try {
    if (readSiMapboxProjectionName(map) !== 'globe') {
      map.setProjection({ name: 'globe' });
    }
  } catch {
    /* ignore */
  }
  if (!enable) return;
  try {
    ensureSiMapTerrainDemSource(map);
    applySiGlobeFogNoHalo(map);
    if (!map.getTerrain()) {
      map.setTerrain({ source: SI_MAPBOX_TERRAIN_DEM_SOURCE_ID, exaggeration: 0 });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Preload DEM + flat terrain mesh in the background so enabling 3D does not wait on
 * new network fetches or layer bootstrap.
 */
export function warmSiMapElevationScene(map: MapboxMap): void {
  if (siElevationSceneWarmed.get(map)) return;
  try {
    if (readSiMapboxProjectionName(map) !== 'globe') {
      map.setProjection({ name: 'globe' });
    }
  } catch {
    /* ignore */
  }
  try {
    ensureSiMapTerrainDemSource(map);
    if (!map.getTerrain()) {
      map.setTerrain({ source: SI_MAPBOX_TERRAIN_DEM_SOURCE_ID, exaggeration: 0 });
    }
    siElevationSceneWarmed.set(map, true);
  } catch {
    /* style not ready */
  }
}

export function resetSiMapElevationSceneWarm(map: MapboxMap): void {
  siElevationSceneWarmed.delete(map);
  siElevationSceneDeepWarmed.delete(map);
}

export function isSiMapElevationSceneDeepWarmed(map: MapboxMap): boolean {
  return Boolean(siElevationSceneDeepWarmed.get(map));
}

/** Preload DEM sources + contour/building overlays without pitching the camera. */
export function warmSiMapElevationSceneDeep(
  map: MapboxMap,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
): void {
  warmSiMapElevationScene(map);
  try {
    applySiMapTerrain(map, {
      enabled: true,
      buildings: terrain.buildings !== false,
      ...terrain,
    });
    siElevationSceneDeepWarmed.set(map, true);
  } catch {
    /* style not ready */
  }
}

/** First-frame terrain bootstrap when globe pitch crosses the live-mesh threshold. */
export function bootstrapSiMapElevationTerrainImmediate(
  map: MapboxMap,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
): void {
  warmSiMapElevationSceneDeep(map, terrain);
}

/** Keep elevation-dock terrain mesh + overlays aligned after camera motion ends. */
export function maintainSiMapElevationDockTerrain(
  map: MapboxMap,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
): void {
  try {
    warmSiMapElevationScene(map);
    applySiMapTerrain(map, {
      enabled: true,
      buildings: terrain.buildings !== false,
      ...terrain,
    });
    const exag = clampTerrainExaggeration(terrain.exaggeration);
    if (map.getSource(SI_MAPBOX_TERRAIN_DEM_SOURCE_ID)) {
      map.setTerrain({ source: SI_MAPBOX_TERRAIN_DEM_SOURCE_ID, exaggeration: exag });
    }
  } catch {
    /* ignore */
  }
}

/** Lightweight terrain refresh while the map is moving under the elevation dock. */
export function tickSiMapElevationDockTerrainDuringMotion(
  map: MapboxMap,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
): void {
  maintainSiMapElevationDockTerrain(map, terrain);
}

/** Target camera after transition completes (center/zoom/bearing preserved). */
export function resolveSiElevationTransitionTargetCamera(
  enable: boolean,
  camera: SiMapCameraSnapshot,
  terrain: SiMapTerrainSettings,
): SiMapCameraSnapshot {
  if (!enable) {
    return { ...camera, pitch: 0 };
  }
  const targetPitch = clampElevationPitch(terrain.elevationPitch ?? SI_ELEVATION_VIEW_PITCH);
  return { ...camera, pitch: Math.max(camera.pitch, targetPitch) };
}

/**
 * Smooth 2D (nadir) → 3D on one Mapbox map: `easeTo` keeps center/zoom/bearing fixed;
 * terrain exaggeration ramps on a parallel timeline (no per-frame camera jumpTo).
 */
export function runSiMapElevationViewTransition(
  map: MapboxMap,
  enable: boolean,
  camera: SiMapCameraSnapshot,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
  opts?: {
    durationMs?: number;
    onProgress?: (progress: SiElevationTransitionProgress) => void;
    onComplete?: () => void;
  },
): SiElevationTransitionHandle {
  siActiveElevationTransition.get(map)?.();

  const durationMs = Math.max(280, opts?.durationMs ?? 720);
  const targetPitch = enable
    ? Math.max(
        camera.pitch,
        clampElevationPitch(terrain.elevationPitch ?? SI_ELEVATION_VIEW_PITCH),
      )
    : 0;
  const targetExag = enable ? clampTerrainExaggeration(terrain.exaggeration) : 0;
  const startPitch = camera.pitch;
  const startExag = readTerrainExaggeration(map);
  const center: [number, number] = [camera.longitude, camera.latitude];
  const zoom = camera.zoom;
  const bearing = camera.bearing;
  const targetOffset = enable
    ? siElevationPitchScreenOffset(map, targetPitch)
    : ([0, 0] as [number, number]);

  prepSiMapElevationScene(map, enable);

  let raf = 0;
  let cancelled = false;
  let cameraDone = false;
  let terrainDone = false;
  const t0 = performance.now();

  const maybeFinish = () => {
    if (cancelled || !cameraDone || !terrainDone) return;
    siActiveElevationTransition.delete(map);

    if (enable) {
      applySiMapTerrain(map, {
        enabled: true,
        buildings: terrain.buildings !== false,
        ...terrain,
      });
      configureSiMapScrollZoomForElevation(map, true);
    } else {
      applySiMapTerrain(map, { enabled: false, buildings: false });
      configureSiMapScrollZoomForElevation(map, false);
      try {
        map.setTerrain(null);
      } catch {
        /* ignore */
      }
    }

    opts?.onProgress?.({ t: 1, pitch: targetPitch, terrainExaggeration: targetExag });
    opts?.onComplete?.();
  };

  const tickTerrain = (now: number) => {
    if (cancelled) return;
    const linear = Math.min(1, (now - t0) / durationMs);
    const eased = siElevationTransitionEase(linear);
    const exag = startExag + (targetExag - startExag) * eased;
    const pitch = startPitch + (targetPitch - startPitch) * eased;

    try {
      if (map.getSource(SI_MAPBOX_TERRAIN_DEM_SOURCE_ID)) {
        map.setTerrain({ source: SI_MAPBOX_TERRAIN_DEM_SOURCE_ID, exaggeration: exag });
      }
    } catch {
      /* ignore mid-style */
    }

    opts?.onProgress?.({ t: eased, pitch, terrainExaggeration: exag });

    if (linear < 1) {
      raf = requestAnimationFrame(tickTerrain);
      return;
    }
    terrainDone = true;
    maybeFinish();
  };

  const onCameraDone = () => {
    if (cancelled) return;
    cameraDone = true;
    try {
      map.jumpTo({
        center,
        zoom,
        bearing,
        pitch: targetPitch,
        offset: targetOffset,
        duration: 0,
      });
    } catch {
      /* ignore */
    }
    maybeFinish();
  };

  const cameraFallbackMs = window.setTimeout(onCameraDone, durationMs + 64);

  const onCameraMoveEnd = () => {
    window.clearTimeout(cameraFallbackMs);
    onCameraDone();
  };

  try {
    map.once('moveend', onCameraMoveEnd);
    map.easeTo({
      center,
      zoom,
      bearing,
      pitch: targetPitch,
      offset: targetOffset,
      duration: durationMs,
      essential: true,
    });
  } catch {
    window.clearTimeout(cameraFallbackMs);
    map.off('moveend', onCameraMoveEnd);
    onCameraDone();
  }

  raf = requestAnimationFrame(tickTerrain);

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
    window.clearTimeout(cameraFallbackMs);
    map.off('moveend', onCameraMoveEnd);
    try {
      map.stop();
    } catch {
      /* ignore */
    }
    siActiveElevationTransition.delete(map);
  };
  siActiveElevationTransition.set(map, cancel);

  return { cancel };
}
