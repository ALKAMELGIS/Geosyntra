import { describe, expect, it } from 'vitest';
import {
  SI_MAPBOX_TERRAIN_DEM_V1_TILE_SIZE,
  isSiMapboxTerrainDemV1Template,
  resolveSiMapboxTerrainDemV1TileUrl,
} from './siMapMapboxTerrainDem';
import { resolveSiMapTerrainDemKind } from './siMapTerrainDemRuntime';

describe('siMapMapboxTerrainDem', () => {
  it('recognizes Mapbox terrain-dem-v1 tile templates', () => {
    expect(
      isSiMapboxTerrainDemV1Template(
        'https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1/{z}/{x}/{y}.webp',
      ),
    ).toBe(true);
    expect(isSiMapboxTerrainDemV1Template('mapbox://mapbox.mapbox-terrain-dem-v1')).toBe(true);
    expect(
      isSiMapboxTerrainDemV1Template(
        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      ),
    ).toBe(false);
  });

  it('builds per-tile DEM URLs from the template', () => {
    const url = resolveSiMapboxTerrainDemV1TileUrl(10, 512, 384);
    expect(url).toContain('10');
    expect(url).toContain('512');
    expect(url).toContain('384');
    expect(url).toContain('mapbox-terrain-dem-v1');
  });

  it('uses 512px Mapbox DEM tiles', () => {
    expect(SI_MAPBOX_TERRAIN_DEM_V1_TILE_SIZE).toBe(512);
  });

  it('falls back to Terrarium when Mapbox DEM is unavailable', () => {
    expect(resolveSiMapTerrainDemKind({ preferMapboxDem: false })).toBe('terrarium');
  });
});
