import { describe, expect, it, vi } from 'vitest';
import {
  isSiMapWmsRasterLayerId,
  raiseSiMapWmsRasterLayersToTop,
  siMapWmsRasterLayerIdForRun,
} from './siMapWmsRasterLayerStack';

describe('isSiMapWmsRasterLayerId', () => {
  it('matches sentinel raster layers', () => {
    expect(isSiMapWmsRasterLayerId('sentinel-layer')).toBe(true);
    expect(isSiMapWmsRasterLayerId('si-sentinel-layer-aoi-1-wms-NDVI')).toBe(true);
    expect(isSiMapWmsRasterLayerId('si-multi-aoi-line')).toBe(false);
  });
});

describe('raiseSiMapWmsRasterLayersToTop', () => {
  it('moves each WMS raster layer to the top', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [{ id: 'si-multi-aoi-line' }, { id: 'si-sentinel-layer-a-b' }],
      }),
      getLayer: (id: string) => (id.startsWith('si-') ? {} : null),
      moveLayer,
    };
    raiseSiMapWmsRasterLayersToTop(map as never);
    expect(moveLayer).toHaveBeenCalledTimes(1);
    expect(moveLayer).toHaveBeenCalledWith('si-sentinel-layer-a-b');
  });
});

describe('siMapWmsRasterLayerIdForRun', () => {
  it('builds stable main-map layer id', () => {
    expect(
      siMapWmsRasterLayerIdForRun({
        aoiId: 'aoi-1',
        stackKey: 'wms-NDVI',
        wmsLayerId: 'NDVI',
        timeStart: 'a',
        timeEnd: 'b',
        tileUrl: 'x',
        bounds: null,
        clip: {},
        ready: true,
      }),
    ).toBe('si-sentinel-layer-aoi-1-wms-NDVI');
  });
});
