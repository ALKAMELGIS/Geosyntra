import { describe, expect, it } from 'vitest';
import {
  collectMapboxCustomLayerAppIds,
  extractSiAppLayerIdFromMapboxLayerId,
  extractSiAppLayerIdFromMapboxSourceId,
  removeAllMapboxMountsForAppLayerId,
} from './siMapLayerMapboxMountCleanup';

describe('siMapLayerReconcile', () => {
  it('extracts app layer id from Mapbox layer ids', () => {
    expect(extractSiAppLayerIdFromMapboxLayerId('parcel-1--abc_r2-fill')).toBe('parcel-1');
    expect(extractSiAppLayerIdFromMapboxLayerId('parcel-1--abc_r2-label-point')).toBe('parcel-1');
    expect(extractSiAppLayerIdFromMapboxLayerId('si-basemap-layer-0')).toBeNull();
  });

  it('extracts app layer id from Mapbox source ids', () => {
    expect(extractSiAppLayerIdFromMapboxSourceId('parcel-1--abc_r2')).toBe('parcel-1');
    expect(extractSiAppLayerIdFromMapboxSourceId('si-wms-raster-0')).toBeNull();
  });

  it('removeAllMapboxMountsForAppLayerId strips all revision mounts', () => {
    const layers: Array<{ id: string }> = [
      { id: 'lyr--old-fill' },
      { id: 'lyr--old-line' },
      { id: 'lyr--new-fill' },
      { id: 'other--x-fill' },
    ];
    const sources: Record<string, unknown> = {
      'lyr--old': {},
      'lyr--new': {},
      'lyr-extent': {},
      other: {},
    };
    const map = {
      getStyle: () => ({ layers, sources }),
      getLayer: (id: string) => layers.some(l => l.id === id),
      getSource: (id: string) => (id in sources ? sources[id] : undefined),
      removeLayer: (id: string) => {
        const ix = layers.findIndex(l => l.id === id);
        if (ix >= 0) layers.splice(ix, 1);
      },
      removeSource: (id: string) => {
        delete sources[id];
      },
    };
    removeAllMapboxMountsForAppLayerId(map as never, 'lyr');
    expect(layers.map(l => l.id)).toEqual(['other--x-fill']);
    expect(Object.keys(sources)).toEqual(['other']);
  });

  it('collectMapboxCustomLayerAppIds gathers unique app ids', () => {
    const map = {
      getStyle: () => ({
        layers: [{ id: 'a--k-fill' }, { id: 'a--k-line' }, { id: 'b--k-circle' }],
        sources: { 'a--k': {}, 'b--k2': {}, 'si-wms-0': {} },
      }),
    };
    const ids = collectMapboxCustomLayerAppIds(map as never);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });
});
