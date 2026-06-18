import type { Map as MapboxMap } from 'mapbox-gl';
import {
  is3dMeshBasemapEntry,
  isGooglePhotorealistic3dBasemapEntry,
  type BasemapCatalogEntry,
} from '../basemapCatalog';
import { findFirstSiBasemapLayerId } from './siMapBasemapRuntime';
import {
  ensureSiMapTerrainDemSource,
} from './siMapTerrainDemRuntime';
import type { SiAddedLayerRowModel } from '../siAddedLayersTypes';

import {
  SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID,
  SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID,
} from './siMapEarthHybridUnderlay';

/** Local ids — avoid circular imports through projection / elevation modules. */
const HILLSHADE_LAYER_ID = 'si-terrain-hillshade';
const BUILDINGS_LAYER_ID = 'si-3d-buildings';
const SI_TERRAIN_DEM_SOURCE_ID = 'si-global-terrain-dem';

function readSiMapTerrainMeshIsLive(map: MapboxMap): boolean {
  try {
    const mesh = map.getTerrain?.();
    if (!mesh) return false;
    const exag = mesh.exaggeration;
    return typeof exag === 'number' && Number.isFinite(exag) && exag > 0;
  } catch {
    return false;
  }
}

/** Mapbox style layers pinned below basemap — not user-reorderable. */
export const SI_MAP_PINNED_TERRAIN_INFRA_LAYER_IDS = [
  SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID,
  SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID,
  HILLSHADE_LAYER_ID,
] as const;

export type SiMapPinnedTerrainInfrastructurePanelOpts = {
  elevation3d: boolean;
  basemapEntry?: BasemapCatalogEntry | null;
};

export function isSiMapPinnedTerrainInfrastructureLayerId(layerId: string): boolean {
  return (
    layerId === SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID ||
    layerId === SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID ||
    layerId === HILLSHADE_LAYER_ID ||
    layerId === BUILDINGS_LAYER_ID
  );
}

export function isSiMapPinnedTerrainInfrastructureSourceId(sourceId: string): boolean {
  return sourceId === SI_TERRAIN_DEM_SOURCE_ID;
}

/** True when a Mapbox layer must not be dragged/deleted from the Added Layers UI. */
export function isSiMapPinnedInfrastructureMapboxLayerId(layerId: string): boolean {
  return isSiMapPinnedTerrainInfrastructureLayerId(layerId);
}

/**
 * Pin relief / hybrid terrain directly under the basemap raster stack.
 * Order (bottom → top): terrain base → Esri hillshade → DEM hillshade → basemap.
 */
export function pinSiMapTerrainInfrastructureBelowBasemap(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const basemapId = findFirstSiBasemapLayerId(map);
  if (!basemapId) return;
  try {
    if (map.getLayer(HILLSHADE_LAYER_ID)) {
      map.moveLayer(HILLSHADE_LAYER_ID, basemapId);
    }
    if (map.getLayer(SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID)) {
      map.moveLayer(SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID, basemapId);
    }
    if (map.getLayer(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID)) {
      map.moveLayer(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID, basemapId);
    }
    if (
      map.getLayer(SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID) &&
      map.getLayer(HILLSHADE_LAYER_ID)
    ) {
      map.moveLayer(SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID, HILLSHADE_LAYER_ID);
    }
    if (
      map.getLayer(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID) &&
      map.getLayer(SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID)
    ) {
      map.moveLayer(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID, SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID);
    }
  } catch {
    /* style rebuild race */
  }
}

/**
 * Background DEM + scene warm — safe on mount and during 3D entry.
 * Does not add user-facing layers; only sources/mesh prep.
 */
export function warmSiMapPinnedTerrainInfrastructureInBackground(
  map: MapboxMap,
  _opts?: { aggressive?: boolean },
): void {
  try {
    ensureSiMapTerrainDemSource(map);
  } catch {
    /* style not ready */
  }
}

/** Keep DEM mesh + relief mounted while 3D Earth view is active. */
export function ensureSiMapPinnedTerrainInfrastructureFor3d(
  map: MapboxMap,
  opts: SiMapPinnedTerrainInfrastructurePanelOpts,
): void {
  if (!opts.elevation3d) return;
  warmSiMapPinnedTerrainInfrastructureInBackground(map, { aggressive: true });
  pinSiMapTerrainInfrastructureBelowBasemap(map);
}

function readHybridOpacity(map: MapboxMap): number {
  try {
    const paint = map.getPaintProperty(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID, 'raster-opacity');
    return typeof paint === 'number' && Number.isFinite(paint) ? paint : 0;
  } catch {
    return 0;
  }
}

/** Developer-mode layer panel rows — read-only, never draggable. */
export function buildSiMapPinnedTerrainInfrastructurePanelRows(
  map: MapboxMap | null | undefined,
  opts: SiMapPinnedTerrainInfrastructurePanelOpts,
): SiAddedLayerRowModel[] {
  const demSourceReady = Boolean(map?.getSource?.(SI_TERRAIN_DEM_SOURCE_ID));
  const demMeshLive = map ? readSiMapTerrainMeshIsLive(map) : false;
  const hybridMounted = Boolean(map?.getLayer?.(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID));
  const hybridVisible = hybridMounted && map ? readHybridOpacity(map) > 0.02 : false;
  const hillshadeMounted = Boolean(map?.getLayer?.(HILLSHADE_LAYER_ID));
  const buildingsMounted = Boolean(map?.getLayer?.(BUILDINGS_LAYER_ID));
  const mesh3d = opts.basemapEntry && is3dMeshBasemapEntry(opts.basemapEntry);
  const google3d = opts.basemapEntry && isGooglePhotorealistic3dBasemapEntry(opts.basemapEntry);

  const staticRow = (
    id: string,
    label: string,
    meta: string,
    visible: boolean,
  ): SiAddedLayerRowModel => ({
    id,
    label,
    meta,
    visible,
    toggleable: false,
    actionable: false,
    pinned: true,
    devOnly: true,
    onToggle: () => {},
  });

  const rows: SiAddedLayerRowModel[] = [
    staticRow(
      'sys-terrain-dem-mesh',
      '3D Terrain (Cesium World Terrain)',
      demMeshLive
        ? 'Active · global DEM mesh'
        : demSourceReady
          ? 'Preloaded · mesh idle'
          : 'Background preload',
      demMeshLive || (opts.elevation3d && demSourceReady),
    ),
    staticRow(
      'sys-terrain-earth-underlay',
      'World Elevation Terrain (Esri)',
      hybridMounted
        ? hybridVisible
          ? 'Below basemap · terrain base + hillshade'
          : 'Mounted · opacity 0'
        : 'Not mounted',
      hybridMounted,
    ),
    staticRow(
      'sys-terrain-hillshade',
      'Hillshade relief',
      hillshadeMounted ? 'Below basemap · DEM hillshade' : 'Not mounted',
      hillshadeMounted,
    ),
  ];

  if (mesh3d) {
    rows.push(
      staticRow(
        'sys-terrain-3d-tiles',
        google3d ? '3D Tiles (Google Photorealistic)' : '3D Tiles (Esri mesh)',
        'Deck.gl overlay · below basemap imagery',
        opts.elevation3d,
      ),
    );
  }

  if (buildingsMounted) {
    rows.push(
      staticRow(
        'sys-terrain-buildings',
        'Mapbox 3D buildings',
        'Composite extrusion · scene context',
        buildingsMounted,
      ),
    );
  }

  return rows;
}
