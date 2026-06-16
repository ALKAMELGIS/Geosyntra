import type { Map as MapboxMap } from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import { I3SLoader } from '@loaders.gl/i3s';
import {
  isEsri3dBuildingsBasemapEntry,
  resolveEsri3dBuildingsSceneVariant,
  type BasemapCatalogEntry,
} from '../basemapCatalog';
import { resolveEsri3dBuildingsSceneLayerUrl } from '../../../lib/esri3dBuildingsSceneUrl';
import { isMapboxStyleReady } from './mapboxStyleReady';
import { removeSiMapboxCompositeBuildingsLayer } from './siMapProjectionTerrain';
import {
  registerSiMap3dTerrainOverlay,
  SI_ESRI_3D_TERRAIN_SSE_IDLE,
} from './siMap3dTerrainCameraPerformance';

type Esri3dBuildingsRuntime = {
  overlay: MapboxOverlay;
  sceneVariant: string;
  entry: BasemapCatalogEntry;
  layer: Tile3DLayer;
  unregisterPerformance?: () => void;
  currentSse: number;
  interleaved: boolean;
};

const runtimeByMap = new WeakMap<MapboxMap, Esri3dBuildingsRuntime>();

function buildTile3DLayer(entry: BasemapCatalogEntry, maxScreenSpaceError: number): Tile3DLayer {
  const sceneVariant = resolveEsri3dBuildingsSceneVariant(entry);
  return new Tile3DLayer({
    id: `si-3d-buildings-tileset-${sceneVariant}`,
    data: resolveEsri3dBuildingsSceneLayerUrl(sceneVariant),
    loader: I3SLoader,
    loadOptions: {
      i3s: { useDracoGeometry: true },
      tileset: { maximumScreenSpaceError: maxScreenSpaceError },
    },
    maxScreenSpaceError,
    refinementStrategy: 'best-available',
    pickable: false,
    _lighting: 'pbr',
  });
}

function applyEsri3dTilesetSse(
  runtime: Esri3dBuildingsRuntime,
  maxScreenSpaceError: number,
): void {
  if (runtime.currentSse === maxScreenSpaceError) return;
  runtime.currentSse = maxScreenSpaceError;
  runtime.layer = runtime.layer.clone({ maxScreenSpaceError }) as Tile3DLayer;
  runtime.overlay.setProps({ layers: [runtime.layer] });
}

function mountEsri3dBuildingsOverlay(
  map: MapboxMap,
  entry: BasemapCatalogEntry,
  interleaved = false,
): void {
  removeSiMapboxCompositeBuildingsLayer(map);
  const sceneVariant = resolveEsri3dBuildingsSceneVariant(entry);
  const layer = buildTile3DLayer(entry, SI_ESRI_3D_TERRAIN_SSE_IDLE);
  const overlay = new MapboxOverlay({
    interleaved,
    layers: [layer],
  });
  map.addControl(overlay);
  const runtime: Esri3dBuildingsRuntime = {
    overlay,
    sceneVariant,
    entry,
    layer,
    currentSse: SI_ESRI_3D_TERRAIN_SSE_IDLE,
    interleaved,
  };
  runtime.unregisterPerformance = registerSiMap3dTerrainOverlay(map, {
    kind: 'esri',
    applyScreenSpaceError: sse => applyEsri3dTilesetSse(runtime, sse),
  });
  runtimeByMap.set(map, runtime);
}

/** Remove Esri I3S buildings overlay from the map. */
export function detachSiMapEsri3dBuildingsLayer(map: MapboxMap): void {
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

/** Attach Esri/OSM I3S building meshes (deck.gl Tile3DLayer + MapboxOverlay). */
export function syncSiMapEsri3dBuildingsLayer(
  map: MapboxMap,
  entry: BasemapCatalogEntry | null | undefined,
  opts?: { interleaved?: boolean },
): void {
  if (!isEsri3dBuildingsBasemapEntry(entry)) {
    detachSiMapEsri3dBuildingsLayer(map);
    return;
  }

  if (!isMapboxStyleReady(map)) {
    // Do not detach while style reloads — basemap-style-ready will re-sync.
    return;
  }

  const sceneVariant = resolveEsri3dBuildingsSceneVariant(entry);
  const interleaved = opts?.interleaved === true;
  const existing = runtimeByMap.get(map);
  if (existing?.sceneVariant === sceneVariant && existing.interleaved === interleaved) {
    existing.entry = entry;
    applyEsri3dTilesetSse(existing, existing.currentSse);
    return;
  }

  detachSiMapEsri3dBuildingsLayer(map);
  mountEsri3dBuildingsOverlay(map, entry, interleaved);
}

export { isEsri3dBuildingsBasemapEntry };
