import { describe, expect, it, beforeEach } from 'vitest';
import {
  cropLercElevationToMapbox256,
  encodeTerrariumRgb,
  ESRI_WORLD_ELEVATION_TERRAIN3D_IMAGE_SERVER,
  fetchEsriTerrariumDemTile,
  resetSiMapEsriWorldElevationTerrainCacheForTests,
  SI_ESRI_WORLD_ELEVATION_DEM_MAX_ZOOM,
  SI_ESRI_WORLD_ELEVATION_DEM_TILE_TEMPLATE,
  isSiEsriWorldElevationDemTemplate,
  resolveSiEsriWorldElevationDemTileUrl,
  siMapEsriWorldElevationDemTileCacheSize,
  synthesizeChildElevationsFromParent,
} from './siMapEsriWorldElevationTerrain';

describe('siMapEsriWorldElevationTerrain', () => {
  beforeEach(() => {
    resetSiMapEsriWorldElevationTerrainCacheForTests();
  });

  it('points DEM tiles at Esri WorldElevation3D Terrain3D ImageServer', () => {
    expect(ESRI_WORLD_ELEVATION_TERRAIN3D_IMAGE_SERVER).toContain('WorldElevation3D/Terrain3D');
    expect(SI_ESRI_WORLD_ELEVATION_DEM_TILE_TEMPLATE).toContain('si-esri-world-elevation://');
  });

  it('exposes Esri Terrain3D max zoom LOD 16', () => {
    expect(SI_ESRI_WORLD_ELEVATION_DEM_MAX_ZOOM).toBe(16);
    expect(resolveSiEsriWorldElevationDemTileUrl(8, 120, 90)).toBe(
      'si-esri-world-elevation://tile/8/120/90',
    );
    expect(isSiEsriWorldElevationDemTemplate(SI_ESRI_WORLD_ELEVATION_DEM_TILE_TEMPLATE)).toBe(true);
  });

  it('crops 257×257 Esri LERC grids to 256×256 Mapbox DEM tiles', () => {
    const src = new Float32Array(257 * 257);
    src[0] = 1200;
    src[257] = 1300;
    src[255 * 257] = 1400;
    const cropped = cropLercElevationToMapbox256(src, 257, 257);
    expect(cropped.width).toBe(256);
    expect(cropped.height).toBe(256);
    expect(cropped.values.length).toBe(256 * 256);
    expect(cropped.values[0]).toBe(1200);
    expect(cropped.values[256]).toBe(1300);
    expect(cropped.values[255 * 256]).toBe(1400);
  });

  it('encodes meters to Terrarium RGB for Mapbox raster-dem', () => {
    const sea = encodeTerrariumRgb(0);
    expect(sea[0]! * 256 * 256 + sea[1]! * 256 + sea[2]!).toBe(100_000);
    const hill = encodeTerrariumRgb(250);
    expect(hill[0]! * 256 * 256 + hill[1]! * 256 + hill[2]!).toBe(102_500);
  });

  it('fetches and decodes live Esri Terrain3D LERC tiles into Terrarium PNG cache', async () => {
    const entry = await fetchEsriTerrariumDemTile(8, 130, 100);
    expect(entry).not.toBeNull();
    expect(entry!.data.byteLength).toBeGreaterThan(1000);
    expect(entry!.elevations.length).toBe(256 * 256);
    expect(siMapEsriWorldElevationDemTileCacheSize()).toBe(1);
    const max = Math.max(...entry!.elevations);
    expect(max).toBeGreaterThan(100);
  }, 20_000);

  it('synthesizes child elevation grids from cached parent tiles', () => {
    const parent = new Float32Array(256 * 256);
    parent.fill(1000);
    parent[0] = 800;
    parent[255] = 1200;
    const child = synthesizeChildElevationsFromParent(parent, 10, 5, 6, 11, 10, 12);
    expect(child).not.toBeNull();
    expect(child!.length).toBe(256 * 256);
    expect(child![0]).toBe(800);
    expect(child![255]).toBeGreaterThan(900);
  });
});
