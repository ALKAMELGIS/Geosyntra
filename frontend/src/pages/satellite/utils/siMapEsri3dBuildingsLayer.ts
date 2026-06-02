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

type Esri3dBuildingsRuntime = {
  overlay: MapboxOverlay;
  sceneVariant: string;
  unbindMapEvents?: () => void;
};

const runtimeByMap = new WeakMap<MapboxMap, Esri3dBuildingsRuntime>();

function buildTile3DLayer(entry: BasemapCatalogEntry): Tile3DLayer {
  const sceneVariant = resolveEsri3dBuildingsSceneVariant(entry);
  return new Tile3DLayer({
    id: `si-3d-buildings-tileset-${sceneVariant}`,
    data: resolveEsri3dBuildingsSceneLayerUrl(sceneVariant),
    loader: I3SLoader,
    loadOptions: {
      i3s: { useDracoGeometry: true },
      tileset: { maximumScreenSpaceError: 6 },
    },
    maxScreenSpaceError: 6,
    pickable: false,
    _lighting: 'pbr',
  });
}

function buildEsri3dBuildingsOverlay(entry: BasemapCatalogEntry): MapboxOverlay {
  return new MapboxOverlay({
    // Draw above raster basemap tiles — interleaved mode needs Mapbox vector depth buffer.
    interleaved: false,
    layers: [buildTile3DLayer(entry)],
  });
}

function bindOverlayMapEvents(map: MapboxMap, overlay: MapboxOverlay, entry: BasemapCatalogEntry): () => void {
  const refresh = () => {
    try {
      overlay.setProps({ layers: [buildTile3DLayer(entry)] });
    } catch {
      /* map mid-style reload */
    }
  };
  map.on('move', refresh);
  map.on('zoom', refresh);
  map.on('pitch', refresh);
  map.on('rotate', refresh);
  map.on('idle', refresh);
  return () => {
    map.off('move', refresh);
    map.off('zoom', refresh);
    map.off('pitch', refresh);
    map.off('rotate', refresh);
    map.off('idle', refresh);
  };
}

function mountEsri3dBuildingsOverlay(map: MapboxMap, entry: BasemapCatalogEntry): void {
  removeSiMapboxCompositeBuildingsLayer(map);
  const overlay = buildEsri3dBuildingsOverlay(entry);
  const sceneVariant = resolveEsri3dBuildingsSceneVariant(entry);
  map.addControl(overlay);
  const unbindMapEvents = bindOverlayMapEvents(map, overlay, entry);
  runtimeByMap.set(map, { overlay, sceneVariant, unbindMapEvents });
  requestAnimationFrame(() => {
    try {
      overlay.setProps({ layers: [buildTile3DLayer(entry)] });
    } catch {
      /* ignore */
    }
  });
}

/** Remove Esri I3S buildings overlay from the map. */
export function detachSiMapEsri3dBuildingsLayer(map: MapboxMap): void {
  const rt = runtimeByMap.get(map);
  if (!rt) return;
  rt.unbindMapEvents?.();
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
  const existing = runtimeByMap.get(map);
  if (existing?.sceneVariant === sceneVariant) {
    try {
      existing.overlay.setProps({ layers: [buildTile3DLayer(entry)] });
    } catch {
      detachSiMapEsri3dBuildingsLayer(map);
      mountEsri3dBuildingsOverlay(map, entry);
    }
    return;
  }

  detachSiMapEsri3dBuildingsLayer(map);
  mountEsri3dBuildingsOverlay(map, entry);
}

export { isEsri3dBuildingsBasemapEntry };
