import { describe, expect, it } from 'vitest';
import {
  buildSiMapSwipeComparableCatalog,
  computeSiMapSwipeClipLayout,
  filterSiMapSwipeComparableKeys,
  isSiMapSwipeContextMapboxLayerId,
  SI_MAP_SWIPE_BASEMAP_KEY,
  SI_MAP_SWIPE_LAYER_LIVE_KEY,
  siMapSwipeKeyForCustomLayer,
  siMapSwipeKeyForWmsLayer,
} from './siMapLayerSwipeCatalog';

describe('siMapLayerSwipeCatalog', () => {
  it('builds stable logical keys', () => {
    expect(siMapSwipeKeyForCustomLayer('upload-1')).toBe('custom:upload-1');
    expect(siMapSwipeKeyForWmsLayer('sentinel-layer')).toBe('wms:sentinel-layer');
    expect(SI_MAP_SWIPE_BASEMAP_KEY).toBe('basemap');
    expect(SI_MAP_SWIPE_LAYER_LIVE_KEY).toBe('layer-live');
  });

  it('computes vertical clip layout from position percent', () => {
    const layout = computeSiMapSwipeClipLayout({ width: 800, height: 600 }, 25, 'vertical');
    expect(layout.clipLeft).toBe(200);
    expect(layout.clipWidth).toBe(600);
    expect(layout.innerLeft).toBe(-200);
    expect(layout.clipHeight).toBe(600);
  });

  it('computes horizontal clip layout from position percent', () => {
    const layout = computeSiMapSwipeClipLayout({ width: 400, height: 200 }, 50, 'horizontal');
    expect(layout.clipTop).toBe(100);
    expect(layout.clipHeight).toBe(100);
    expect(layout.innerTop).toBe(-100);
  });

  it('excludes basemap from comparable swipe keys', () => {
    expect(filterSiMapSwipeComparableKeys(['basemap', 'custom:builds'])).toEqual(['custom:builds']);
  });

  it('builds comparable catalog without basemap', () => {
    const catalog = [
      { key: SI_MAP_SWIPE_BASEMAP_KEY, label: 'Google Satellite', kind: 'basemap' as const, mapboxLayerIds: ['si-basemap-x-layer-0'] },
      { key: 'custom:builds', label: 'builds', kind: 'custom' as const, mapboxLayerIds: ['src-builds-fill'] },
      { key: SI_MAP_SWIPE_LAYER_LIVE_KEY, label: 'Layer Live', kind: 'wms' as const, mapboxLayerIds: ['si-wms-x'] },
    ];
    expect(buildSiMapSwipeComparableCatalog(catalog).map(e => e.key)).toEqual(['custom:builds', 'layer-live']);
  });

  it('treats basemap and terrain as swipe context layers', () => {
    expect(isSiMapSwipeContextMapboxLayerId('si-basemap-google-layer-0')).toBe(true);
    expect(isSiMapSwipeContextMapboxLayerId('si-terrain-hillshade')).toBe(true);
    expect(isSiMapSwipeContextMapboxLayerId('si-3d-buildings')).toBe(true);
    expect(isSiMapSwipeContextMapboxLayerId('custom-src-fill')).toBe(false);
  });
});
