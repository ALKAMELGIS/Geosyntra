import { describe, expect, it } from 'vitest';
import {
  bbox3857FromFeature,
  decodeWmsIndexGridRaster,
  decodeWmsIndexSamplePixels,
  rasterHasScatterPair,
  wmsStatsImageDimensions,
} from './wmsAoiLiveIndexSample';
import type { SiAoiRasterPixelSample } from '../pages/satellite/utils/siAoiZonalStats';
import { wmsIndexStatsDecodeRange } from './sentinelHubWmsAoiClip';

describe('wmsAoiLiveIndexSample', () => {
  const aoi: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0.01],
          [0, 0],
        ],
      ],
    },
  };

  it('builds mercator bbox from feature', () => {
    const bbox = bbox3857FromFeature(aoi);
    expect(bbox).not.toBeNull();
    expect(bbox![2]).toBeGreaterThan(bbox![0]!);
    expect(bbox![3]).toBeGreaterThan(bbox![1]!);
  });

  it('chooses image dimensions with aspect ratio', () => {
    const bbox: [number, number, number, number] = [0, 0, 2000, 1000];
    const dim = wmsStatsImageDimensions(bbox, 512);
    expect(dim.width).toBe(512);
    expect(dim.height).toBeGreaterThan(64);
  });

  it('decodes encoded index pixels inside AOI', () => {
    const bbox = bbox3857FromFeature(aoi)!;
    const width = 32;
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    const r = Math.round(0.75 * 255);
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const idx = (cy * width + cx) * 4;
    data[idx] = r;
    data[idx + 3] = 255;

    const range = wmsIndexStatsDecodeRange('ndvi')!;
    const { values } = decodeWmsIndexSamplePixels(
      data,
      width,
      height,
      bbox,
      aoi.geometry!,
      range,
    );
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toBeCloseTo(0.5, 1);
  });

  it('fills full grid with NaN outside AOI clip', () => {
    const bbox = bbox3857FromFeature(aoi)!;
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    const range = wmsIndexStatsDecodeRange('ndvi')!;
    const center = (2 * width + 2) * 4;
    data[center] = Math.round(0.6 * 255);
    data[center + 3] = 255;

    const grid = decodeWmsIndexGridRaster(data, width, height, bbox, aoi.geometry!, range);
    expect(grid.length).toBe(16);
    expect(Number.isNaN(grid[0])).toBe(true);
    expect(grid[10]).toBeCloseTo(0.2, 1);
  });

  it('multi-index zonal mode accepts a single valid layer without scatter pair', () => {
    const sparse: SiAoiRasterPixelSample = {
      grid: [{ lng: 1, lat: 2 }],
      layers: { NDVI: [0.42] },
      areaHa: 0,
      resolutionM: 20,
    };
    expect(
      rasterHasScatterPair(sparse, 'NDVI', 'NDWI', 8),
    ).toBe(false);
  });
});
