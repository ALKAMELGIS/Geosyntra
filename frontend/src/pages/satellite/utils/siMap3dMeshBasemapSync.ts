import type { Map as MapboxMap } from 'mapbox-gl';
import {
  is3dMeshBasemapEntry,
  isEsri3dBuildingsBasemapEntry,
  isGooglePhotorealistic3dBasemapEntry,
  type BasemapCatalogEntry,
} from '../basemapCatalog';
import {
  detachSiMapEsri3dBuildingsLayer,
  syncSiMapEsri3dBuildingsLayer,
} from './siMapEsri3dBuildingsLayer';
import {
  detachSiMapGooglePhotorealistic3dLayer,
  syncSiMapGooglePhotorealistic3dLayer,
} from './siMapGooglePhotorealistic3dLayer';

export type SyncSiMap3dMeshBasemapLayerOpts = {
  /** Interleave deck.gl with Mapbox so contour lines can render above the mesh. */
  interleaved?: boolean;
};

/**
 * Deck overlay defaults to a top canvas — interleave when contours or 3D Elevation need
 * Mapbox vector layers composited with the mesh (each tool independent).
 */
export function buildSiMap3dMeshBasemapSyncOpts(
  contourEnabled: boolean,
  elevationDock3d = false,
): SyncSiMap3dMeshBasemapLayerOpts {
  return { interleaved: contourEnabled || elevationDock3d };
}

/** Sync Esri I3S or Google Photorealistic 3D mesh basemap (mutually exclusive). */
export function syncSiMap3dMeshBasemapLayer(
  map: MapboxMap,
  entry: BasemapCatalogEntry | null | undefined,
  opts?: SyncSiMap3dMeshBasemapLayerOpts,
): void {
  if (isGooglePhotorealistic3dBasemapEntry(entry)) {
    detachSiMapEsri3dBuildingsLayer(map);
    syncSiMapGooglePhotorealistic3dLayer(map, entry, opts);
    return;
  }
  if (isEsri3dBuildingsBasemapEntry(entry)) {
    detachSiMapGooglePhotorealistic3dLayer(map);
    syncSiMapEsri3dBuildingsLayer(map, entry, opts);
    return;
  }
  detachSiMapEsri3dBuildingsLayer(map);
  detachSiMapGooglePhotorealistic3dLayer(map);
}

export { is3dMeshBasemapEntry };
