import { describe, expect, it } from 'vitest';
import {
  beginSiCustomLayerMapRefresh,
  buildCustomLayerStackSyncSig,
  finalizeSiCustomLayerMapRefresh,
  isSiCustomLayerMapRefreshInFlight,
  resolveSiCustomLayerMapDisplayLayer,
} from './siMapLayerRefreshBuffer';
import { buildCustomLayerMapboxStyleKey } from './siMapCustomLayerRegistry';

const baseLayer = {
  id: 'lyr-1',
  name: 'Buildings',
  visible: true,
  loadStatus: 'loaded' as const,
  mapRenderRevision: 2,
  geojson: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }],
  },
};

describe('siMapLayerRefreshBuffer', () => {
  it('beginSiCustomLayerMapRefresh snapshots committed geojson and style key', () => {
    const next = beginSiCustomLayerMapRefresh(baseLayer, {
      geojson: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: {} },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 2] }, properties: {} },
        ],
      },
    });
    expect(next.loadStatus).toBe('refreshing');
    expect(next.mapRenderRevision).toBe(2);
    expect((next.mapCommittedGeojson as { features: unknown[] }).features).toHaveLength(1);
    expect(next.geojson).not.toBe(next.mapCommittedGeojson);
    expect(next.mapCommittedStyleKey).toBeTruthy();
  });

  it('resolveSiCustomLayerMapDisplayLayer serves committed geojson while refreshing', () => {
    const refreshing = beginSiCustomLayerMapRefresh(baseLayer, {
      geojson: { type: 'FeatureCollection', features: [{}, {}, {}] },
    });
    const display = resolveSiCustomLayerMapDisplayLayer(refreshing);
    expect((display.geojson as { features: unknown[] }).features).toHaveLength(1);
  });

  it('finalizeSiCustomLayerMapRefresh clears snapshot and sets loaded', () => {
    const refreshing = beginSiCustomLayerMapRefresh(baseLayer, {
      geojson: { type: 'FeatureCollection', features: [{}, {}] },
    });
    const done = finalizeSiCustomLayerMapRefresh(refreshing, true, 2);
    expect(done.loadStatus).toBe('loaded');
    expect(done.mapCommittedGeojson).toBeUndefined();
    expect(done.mapCommittedStyleKey).toBeUndefined();
  });

  it('finalizeSiCustomLayerMapRefresh bumps revision only when requested', () => {
    const refreshing = beginSiCustomLayerMapRefresh(baseLayer, {});
    const noBump = finalizeSiCustomLayerMapRefresh(refreshing, true, 1);
    expect(noBump.mapRenderRevision).toBe(2);
    const bumped = finalizeSiCustomLayerMapRefresh(refreshing, true, 1, { bumpRevision: true });
    expect(bumped.mapRenderRevision).toBe(3);
  });

  it('buildCustomLayerStackSyncSig ignores feature count changes', () => {
    const styleKey = buildCustomLayerMapboxStyleKey(baseLayer);
    const sigA = buildCustomLayerStackSyncSig([baseLayer], () => styleKey, false);
    const moreFeatures = {
      ...baseLayer,
      geojson: {
        type: 'FeatureCollection',
        features: [{}, {}, {}],
      },
    };
    const sigB = buildCustomLayerStackSyncSig([moreFeatures], () => styleKey, false);
    expect(sigA).toBe(sigB);
  });

  it('buildCustomLayerStackSyncSig includes elevation mode', () => {
    const styleKey = buildCustomLayerMapboxStyleKey(baseLayer);
    const sig2d = buildCustomLayerStackSyncSig([baseLayer], () => styleKey, false);
    const sig3d = buildCustomLayerStackSyncSig([baseLayer], () => styleKey, true);
    expect(sig2d.startsWith('2d|')).toBe(true);
    expect(sig3d.startsWith('3d|')).toBe(true);
    expect(sig2d).not.toBe(sig3d);
  });

  it('isSiCustomLayerMapRefreshInFlight detects loading and refreshing', () => {
    expect(isSiCustomLayerMapRefreshInFlight({ ...baseLayer, loadStatus: 'loading' })).toBe(true);
    expect(isSiCustomLayerMapRefreshInFlight({ ...baseLayer, loadStatus: 'refreshing' })).toBe(true);
    expect(isSiCustomLayerMapRefreshInFlight({ ...baseLayer, loadStatus: 'loaded' })).toBe(false);
  });
});
