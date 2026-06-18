import type { Map as MapboxMap } from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import { Tiles3DLoader } from '@loaders.gl/3d-tiles';
import {
  isGooglePhotorealistic3dBasemapEntry,
  type BasemapCatalogEntry,
} from '../basemapCatalog';
import {
  resolveGooglePhotorealistic3dTilesetConfig,
  type GooglePhotorealistic3dTilesetConfig,
} from '../../../lib/google3dTilesUrl';
import { isMapboxStyleReady } from './mapboxStyleReady';
import { removeSiMapboxCompositeBuildingsLayer } from './siMapProjectionTerrain';
import {
  registerSiMap3dTerrainOverlay,
  SI_GOOGLE_3D_TERRAIN_SSE_IDLE,
} from './siMap3dTerrainCameraPerformance';

type GooglePhotorealisticRuntime = {
  overlay: MapboxOverlay;
  cfg: GooglePhotorealistic3dTilesetConfig;
  layer: Tile3DLayer;
  unregisterPerformance?: () => void;
  currentSse: number;
  interleaved: boolean;
};

const runtimeByMap = new WeakMap<MapboxMap, GooglePhotorealisticRuntime>();

function buildGooglePhotorealisticTile3DLayer(
  cfg: GooglePhotorealistic3dTilesetConfig,
  maxScreenSpaceError: number,
): Tile3DLayer {
  return new Tile3DLayer({
    id: 'si-google-photorealistic-3d',
    data: cfg.url,
    loader: Tiles3DLoader,
    loadOptions: cfg.loadOptions,
    maxScreenSpaceError,
    pickable: true,
    operation: 'terrain+draw',
    _lighting: 'pbr',
  });
}

function applyGoogle3dTilesetSse(runtime: GooglePhotorealisticRuntime, maxScreenSpaceError: number): void {
  if (runtime.currentSse === maxScreenSpaceError) return;
  runtime.currentSse = maxScreenSpaceError;
  runtime.layer = runtime.layer.clone({ maxScreenSpaceError }) as Tile3DLayer;
  runtime.overlay.setProps({ layers: [runtime.layer] });
}

function mountGooglePhotorealisticOverlay(map: MapboxMap, interleaved = false): void {
  removeSiMapboxCompositeBuildingsLayer(map);
  const cfg = resolveGooglePhotorealistic3dTilesetConfig();
  const layer = buildGooglePhotorealisticTile3DLayer(cfg, SI_GOOGLE_3D_TERRAIN_SSE_IDLE);
  const overlay = new MapboxOverlay({
    interleaved,
    layers: [layer],
  });
  map.addControl(overlay);
  const runtime: GooglePhotorealisticRuntime = {
    overlay,
    cfg,
    layer,
    currentSse: SI_GOOGLE_3D_TERRAIN_SSE_IDLE,
    interleaved,
  };
  runtime.unregisterPerformance = registerSiMap3dTerrainOverlay(map, {
    kind: 'google',
    applyScreenSpaceError: sse => applyGoogle3dTilesetSse(runtime, sse),
  });
  runtimeByMap.set(map, runtime);
}

/** Remove Google Photorealistic 3D mesh overlay from the map. */
export function detachSiMapGooglePhotorealistic3dLayer(map: MapboxMap): void {
  const rt = runtimeByMap.get(map);
  if (!rt) return;
  rt.unregisterPerformance?.();
  try {
    map.removeControl(rt.overlay);
  } catch {
    /* control already removed during style reload */
  }
  runtimeByMap.delete(map);
}

/** Attach Google Map Tiles API photorealistic mesh (deck.gl Tile3DLayer + MapboxOverlay). */
export function syncSiMapGooglePhotorealistic3dLayer(
  map: MapboxMap,
  entry: BasemapCatalogEntry | null | undefined,
  opts?: { interleaved?: boolean },
): void {
  if (!isGooglePhotorealistic3dBasemapEntry(entry)) {
    detachSiMapGooglePhotorealistic3dLayer(map);
    return;
  }

  if (!isMapboxStyleReady(map)) return;

  const interleaved = opts?.interleaved === true;
  const existing = runtimeByMap.get(map);
  if (existing && existing.interleaved === interleaved) {
    applyGoogle3dTilesetSse(existing, existing.currentSse);
    return;
  }

  detachSiMapGooglePhotorealistic3dLayer(map);
  mountGooglePhotorealisticOverlay(map, interleaved);
}
