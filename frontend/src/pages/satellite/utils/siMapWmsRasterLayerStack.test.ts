import { describe, expect, it, vi } from 'vitest';
import {
  findMapboxInsertBeforeIdAboveWmsStack,
  isSiMapWmsRasterLayerId,
  raiseSiMapTerrainContourLayersAboveWms,
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

describe('findMapboxInsertBeforeIdAboveWmsStack', () => {
  it('returns layer id above topmost WMS', () => {
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'si-basemap-layer-0' },
          { id: 'si-sentinel-layer-live' },
          { id: 'si-multi-aoi-line' },
        ],
      }),
    };
    expect(findMapboxInsertBeforeIdAboveWmsStack(map as never)).toBe('si-multi-aoi-line');
  });

  it('returns undefined when WMS is topmost', () => {
    const map = {
      getStyle: () => ({
        layers: [{ id: 'si-sentinel-layer-live' }],
      }),
    };
    expect(findMapboxInsertBeforeIdAboveWmsStack(map as never)).toBeUndefined();
  });
});

describe('raiseSiMapTerrainContourLayersAboveWms', () => {
  it('moves contour layers above WMS stack', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'si-sentinel-layer-live' },
          { id: 'si-terrain-contours' },
        ],
      }),
      getLayer: (id: string) =>
        id === 'si-terrain-contours' || id === 'si-terrain-contour-labels' ? {} : null,
      moveLayer,
    };
    raiseSiMapTerrainContourLayersAboveWms(map as never);
    expect(moveLayer).toHaveBeenCalledWith('si-terrain-contours', undefined);
    expect(moveLayer).toHaveBeenCalledWith('si-terrain-contour-labels', undefined);
  });
});

describe('raiseSiMapWmsRasterLayersToTop', () => {
  it('moves each WMS raster layer to the top then raises contours', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'si-multi-aoi-line' },
          { id: 'si-sentinel-layer-a-b' },
          { id: 'si-terrain-contours' },
        ],
      }),
      getLayer: (id: string) => (id.startsWith('si-') ? {} : null),
      moveLayer,
    };
    raiseSiMapWmsRasterLayersToTop(map as never);
    expect(moveLayer).toHaveBeenCalledWith('si-sentinel-layer-a-b');
    expect(moveLayer).toHaveBeenCalledWith('si-terrain-contours', undefined);
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
