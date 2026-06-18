import {
  ESRI_WORLD_TERRAIN_BASE_URL,
  rasterStyleFromTiles,
  type BasemapCatalogEntry,
  type LeafletTileSpec,
} from './basemapCatalog';

/**
 * Esri Living Atlas — World Elevation Terrain basemap (ArcGIS item reference).
 * @see https://www.arcgis.com/home/item.html?id=b5676525747f499687f12746441101ef
 *
 * ArcGIS `VectorTileLayer` root.json is not loaded directly — Mapbox GL throws
 * `Unimplemented type: 4` when vector tile bytes are empty/HTML (common in dev).
 * We mirror the terrain appearance with Esri raster relief stacks (Mapbox-safe).
 */
export const ESRI_WORLD_ELEVATION_TERRAIN_BASEMAP_ID = 'esri-world-elevation-terrain';

export const ESRI_WORLD_ELEVATION_TERRAIN_ITEM_ID = 'b5676525747f499687f12746441101ef';

/** ArcGIS Online item style URL (reference only — not passed to Mapbox `setStyle`). */
export const ESRI_WORLD_ELEVATION_TERRAIN_STYLE_URL =
  `https://www.arcgis.com/sharing/rest/content/items/${ESRI_WORLD_ELEVATION_TERRAIN_ITEM_ID}/resources/styles/root.json`;

export const ESRI_WORLD_ELEVATION_TERRAIN_THUMBNAIL_URL =
  `https://www.arcgis.com/sharing/rest/content/items/${ESRI_WORLD_ELEVATION_TERRAIN_ITEM_ID}/info/thumbnail/ago_downloaded.png`;

export const ESRI_WORLD_ELEVATION_TERRAIN_TITLE = 'Terrain';

const ATTR_ESRI = 'Tiles © Esri';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

const ESRI_WORLD_HILLSHADE_URL = `${ESRI}/World_Hillshade/MapServer/tile/{z}/{y}/{x}`;
const ESRI_WORLD_REFERENCE_OVERLAY_URL = `${ESRI}/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}`;

/**
 * ArcGIS World Elevation Terrain underlay — mounted below the active basemap in 3D
 * (equivalent to `Basemap({ baseLayers: [VectorTileLayer…] })` without replacing imagery).
 */
export function esriWorldElevationTerrainUnderlayLayers(): LeafletTileSpec[] {
  return [
    { url: ESRI_WORLD_TERRAIN_BASE_URL, attribution: ATTR_ESRI },
    { url: ESRI_WORLD_HILLSHADE_URL, attribution: ATTR_ESRI, opacity: 0.52 },
  ];
}

/** Full standalone relief stack — terrain base + hillshade + labels (legacy / tests). */
export function esriWorldElevationTerrainRasterLayers(): LeafletTileSpec[] {
  return [
    ...esriWorldElevationTerrainUnderlayLayers(),
    { url: ESRI_WORLD_REFERENCE_OVERLAY_URL, attribution: ATTR_ESRI, opacity: 0.88 },
  ];
}

export function buildEsriWorldElevationTerrainBasemapEntry(): BasemapCatalogEntry {
  const layers = esriWorldElevationTerrainRasterLayers();
  return {
    id: ESRI_WORLD_ELEVATION_TERRAIN_BASEMAP_ID,
    label: 'World Elevation Terrain (Esri)',
    mapboxStyle: rasterStyleFromTiles(layers),
    leafletLayers: layers,
    thumbnailUrl: ESRI_WORLD_ELEVATION_TERRAIN_THUMBNAIL_URL,
    esriWorldElevationTerrain: true,
    badges: ['3D', 'Terrain'],
  };
}

export function isEsriWorldElevationTerrainBasemapEntry(
  entry: BasemapCatalogEntry | null | undefined,
): boolean {
  return Boolean(entry?.esriWorldElevationTerrain) || entry?.id === ESRI_WORLD_ELEVATION_TERRAIN_BASEMAP_ID;
}

/** External ArcGIS vector style URLs — not used as live Mapbox styles in GeoSyntra. */
export function isArcGisVectorStyleBasemapEntry(
  entry: BasemapCatalogEntry | null | undefined,
): boolean {
  if (!entry) return false;
  return (
    typeof entry.mapboxStyle === 'string' &&
    entry.mapboxStyle.includes('/sharing/rest/content/items/') &&
    !isEsriWorldElevationTerrainBasemapEntry(entry)
  );
}
