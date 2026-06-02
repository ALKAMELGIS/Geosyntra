import { describe, expect, it } from 'vitest';
import { buildProviderLayerOptions, resolveDefaultAoiDrawWmsLayerId } from './provider-layer-mapper';
import { getSatelliteProvider } from './provider-capabilities';

const HIDDEN = new Set<string>();

describe('buildProviderLayerOptions', () => {
  it('exposes full Sentinel Hub GetCapabilities list (Layer Live)', () => {
    const wms = [
      { name: 'NDVI', title: 'NDVI' },
      { name: 'RANDOM_LAYER', title: 'Random layer' },
    ];
    const opts = buildProviderLayerOptions('sentinel-hub', wms, HIDDEN);
    expect(opts.length).toBe(2);
    expect(opts.every(o => o.providerId === 'sentinel-hub')).toBe(true);
    expect(opts.some(o => o.id === 'NDVI')).toBe(true);
    expect(opts.some(o => o.id === 'RANDOM_LAYER')).toBe(true);
  });

  it('resolves Highlight Optimized Natural Color as default AOI draw layer', () => {
    const id = resolveDefaultAoiDrawWmsLayerId([
      { id: 'NDVI', label: 'NDVI' },
      { id: 'HIGHLIGHT_OPTIMIZED_NATURAL_COLOR', label: 'Highlight Optimized Natural Color' },
    ]);
    expect(id).toBe('HIGHLIGHT_OPTIMIZED_NATURAL_COLOR');
  });

  it('returns no Planet layers when WMS GetCapabilities is empty', () => {
    const opts = buildProviderLayerOptions('planet-labs', [], HIDDEN);
    expect(opts.length).toBe(0);
  });

  it('returns no Sentinel Hub layers when GetCapabilities is empty', () => {
    const opts = buildProviderLayerOptions('sentinel-hub', [], HIDDEN);
    expect(opts.length).toBe(0);
  });

  it('dedupes API layers that share the same display title (case-insensitive)', () => {
    const wms = [
      { name: 'FALSE_COLOR_A', title: 'False color' },
      { name: 'FALSE_COLOR_B', title: 'False Color' },
      { name: 'NDVI', title: 'NDVI' },
      { name: 'NDVI_LEGACY', title: 'NDVI' },
    ];
    const opts = buildProviderLayerOptions('sentinel-hub', wms, HIDDEN);
    expect(opts.length).toBe(2);
    expect(opts.map(o => o.label)).toEqual(['False color', 'NDVI']);
    expect(opts.every(o => o.nativeWms)).toBe(true);
  });

  it('uses WMS title from API, not static catalog label', () => {
    const wms = [{ name: 'NDVI', title: 'Normalized Difference Vegetation Index' }];
    const opts = buildProviderLayerOptions('sentinel-hub', wms, HIDDEN);
    expect(opts[0]?.label).toBe('Normalized Difference Vegetation Index');
  });
});
