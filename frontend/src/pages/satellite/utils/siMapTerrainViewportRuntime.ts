import type { Map as MapboxMap } from 'mapbox-gl';
import { isSiMap3dTerrainCameraMoving } from './siMap3dTerrainCameraPerformance';
import {
  applySiMapGlobeLiveTerrainFromPitch,
  siMapGlobeLiveTerrainShouldBeEnabled,
} from './siMapGlobeFreeCamera';
import {
  maintainSiMapElevationDockTerrain,
  tickSiMapElevationDockTerrainDuringMotion,
} from './siMapElevationTransition';
import {
  appendSiTerrainDemPrefetchTiles,
  prefetchSiTerrainDemForViewport,
} from './siMapTerrainDemRuntime';
import {
  refreshSiMapTerrainContourElevationConform,
  type SiMapContourViewContext,
  type SiMapTerrainSettings,
} from './siMapProjectionTerrain';
import { raiseSiMapTerrainContourLayersAboveWms } from './siMapWmsRasterLayerStack';
import { flushSiMapTerrainPendingExaggeration } from './siMapTerrainStability';

export type SiMapTerrainViewportRuntimeOpts = {
  readElevationDock3d: () => boolean;
  readTerrainSettings: () => SiMapTerrainSettings & { buildings?: boolean };
  readPitch: () => number;
  readContourCtx: () => SiMapContourViewContext | undefined;
  readContourEnabled: () => boolean;
};

const detachByMap = new WeakMap<MapboxMap, () => void>();

/**
 * Live terrain + progressive DEM warm while panning/zooming — keeps elevation visible with
 * minimal wait; detail tiles and contour conform finish on moveend.
 */
export function bindSiMapTerrainViewportRuntime(
  map: MapboxMap,
  opts: SiMapTerrainViewportRuntimeOpts,
): () => void {
  detachSiMapTerrainViewportRuntime(map);

  let terrainMoveRaf = 0;
  let lastTerrainTickMs = 0;
  let moveEndTimer = 0;

  const tickTerrainDuringMotion = () => {
    const pitch = opts.readPitch();
    const dock = opts.readElevationDock3d();
    if (!siMapGlobeLiveTerrainShouldBeEnabled(pitch, dock)) return;

    const terrain = opts.readTerrainSettings();
    if (dock) {
      tickSiMapElevationDockTerrainDuringMotion(map, terrain);
    } else {
      applySiMapGlobeLiveTerrainFromPitch(map, pitch, terrain);
    }

    try {
      const center = map.getCenter?.();
      const zoom = map.getZoom?.();
      if (center && Number.isFinite(center.lng) && Number.isFinite(center.lat)) {
        appendSiTerrainDemPrefetchTiles(
          {
            lng: center.lng,
            lat: center.lat,
            zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 2,
          },
          { radius: 1, progressive: true, lookaheadRing: 1, maxZoomOffset: 2 },
        );
      }
    } catch {
      /* ignore */
    }
  };

  const onMove = () => {
    if (terrainMoveRaf) return;
    terrainMoveRaf = requestAnimationFrame(() => {
      terrainMoveRaf = 0;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastTerrainTickMs < 32) return;
      lastTerrainTickMs = now;
      tickTerrainDuringMotion();
      if (opts.readContourEnabled()) {
        raiseSiMapTerrainContourLayersAboveWms(map, { force: true });
      }
    });
  };

  const onMoveEnd = () => {
    window.clearTimeout(moveEndTimer);
    moveEndTimer = window.setTimeout(() => {
      const pitch = opts.readPitch();
      const dock = opts.readElevationDock3d();
      const terrain = opts.readTerrainSettings();
      if (siMapGlobeLiveTerrainShouldBeEnabled(pitch, dock)) {
        if (dock) {
          maintainSiMapElevationDockTerrain(map, terrain);
        } else {
          applySiMapGlobeLiveTerrainFromPitch(map, pitch, terrain);
        }
      }
      flushSiMapTerrainPendingExaggeration(map);
      prefetchSiTerrainDemForViewport(map, true);
      if (opts.readContourEnabled()) {
        const ctx = opts.readContourCtx();
        refreshSiMapTerrainContourElevationConform(map, ctx);
        raiseSiMapTerrainContourLayersAboveWms(map, { force: true });
      }
      try {
        map.triggerRepaint?.();
      } catch {
        /* ignore */
      }
    }, 24);
  };

  map.on('move', onMove);
  map.on('moveend', onMoveEnd);

  const detach = () => {
    window.clearTimeout(moveEndTimer);
    if (terrainMoveRaf) cancelAnimationFrame(terrainMoveRaf);
    try {
      map.off('move', onMove);
      map.off('moveend', onMoveEnd);
    } catch {
      /* map destroyed */
    }
    detachByMap.delete(map);
  };

  detachByMap.set(map, detach);
  return detach;
}

export function detachSiMapTerrainViewportRuntime(map: MapboxMap): void {
  detachByMap.get(map)?.();
}
