import { describe, expect, it } from 'vitest';
import {
  SI_CESIUM_WORLD_TERRAIN_DEM_MAX_ZOOM,
  SI_CESIUM_WORLD_TERRAIN_DEM_TILE_TEMPLATE,
  isSiCesiumWorldTerrainDemTemplate,
  resolveCesiumWorldTerrainDemTileUrl,
} from './siMapCesiumWorldTerrain';

describe('siMapCesiumWorldTerrain', () => {
  it('exposes global Terrarium tiles as Cesium World Terrain equivalent for Mapbox', () => {
    expect(SI_CESIUM_WORLD_TERRAIN_DEM_TILE_TEMPLATE).toContain('elevation-tiles-prod/terrarium');
    expect(SI_CESIUM_WORLD_TERRAIN_DEM_MAX_ZOOM).toBe(15);
  });

  it('resolves z/x/y Terrarium tile URLs', () => {
    expect(resolveCesiumWorldTerrainDemTileUrl(8, 120, 90)).toBe(
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/8/120/90.png',
    );
  });

  it('detects the active Cesium world terrain template', () => {
    expect(isSiCesiumWorldTerrainDemTemplate(SI_CESIUM_WORLD_TERRAIN_DEM_TILE_TEMPLATE)).toBe(true);
    expect(isSiCesiumWorldTerrainDemTemplate('si-esri-world-elevation://tile/{z}/{x}/{y}')).toBe(
      false,
    );
  });
});
