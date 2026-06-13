import { describe, expect, it } from 'vitest';

import {

  ESRI_WORLD_ELEVATION_TERRAIN_BASEMAP_ID,

  ESRI_WORLD_ELEVATION_TERRAIN_ITEM_ID,

  ESRI_WORLD_ELEVATION_TERRAIN_STYLE_URL,

  ESRI_WORLD_ELEVATION_TERRAIN_THUMBNAIL_URL,

  buildEsriWorldElevationTerrainBasemapEntry,

  esriWorldElevationTerrainRasterLayers,

  esriWorldElevationTerrainUnderlayLayers,

  isArcGisVectorStyleBasemapEntry,

  isEsriWorldElevationTerrainBasemapEntry,

} from './esriWorldElevationTerrainBasemap';



describe('esriWorldElevationTerrainBasemap', () => {

  it('keeps ArcGIS item metadata but uses Mapbox-safe raster tiles', () => {

    const entry = buildEsriWorldElevationTerrainBasemapEntry();

    expect(entry.id).toBe(ESRI_WORLD_ELEVATION_TERRAIN_BASEMAP_ID);

    expect(ESRI_WORLD_ELEVATION_TERRAIN_STYLE_URL).toContain(ESRI_WORLD_ELEVATION_TERRAIN_ITEM_ID);

    expect(entry.thumbnailUrl).toBe(ESRI_WORLD_ELEVATION_TERRAIN_THUMBNAIL_URL);

    expect(entry.leafletLayers?.length).toBe(3);

    expect(entry.leafletLayers?.[0]?.url).toContain('World_Terrain_Base');

    expect(entry.leafletLayers?.[1]?.url).toContain('World_Hillshade');

    expect(typeof entry.mapboxStyle).toBe('object');

    expect(isEsriWorldElevationTerrainBasemapEntry(entry)).toBe(true);

    expect(isArcGisVectorStyleBasemapEntry(entry)).toBe(false);

  });



  it('exposes a two-layer underlay stack without reference labels', () => {

    const underlay = esriWorldElevationTerrainUnderlayLayers();

    expect(underlay.length).toBe(2);

    expect(underlay[0]?.url).toContain('World_Terrain_Base');

    expect(underlay[1]?.url).toContain('World_Hillshade');

    expect(esriWorldElevationTerrainRasterLayers().length).toBe(3);

  });

});


