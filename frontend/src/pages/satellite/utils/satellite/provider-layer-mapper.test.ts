import { describe, expect, it } from 'vitest';
import { buildProviderLayerOptions } from './provider-layer-mapper';
import { getSatelliteProvider } from './provider-capabilities';

const HIDDEN = new Set<string>();

describe('buildProviderLayerOptions', () => {
  it('filters Sentinel Hub layers to catalog entries', () => {
    const wms = [
      { name: 'NDVI', title: 'NDVI' },
      { name: 'RANDOM_LAYER', title: 'Random' },
    ];
    const opts = buildProviderLayerOptions('sentinel-hub', wms, HIDDEN);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every(o => o.providerId === 'sentinel-hub')).toBe(true);
    expect(opts.some(o => o.catalogId === 'ndvi')).toBe(true);
    expect(opts.some(o => o.id === 'RANDOM_LAYER')).toBe(false);
  });

  it('returns Planet catalog layers when WMS bridge is missing', () => {
    const opts = buildProviderLayerOptions('planet-labs', [], HIDDEN);
    const provider = getSatelliteProvider('planet-labs');
    expect(opts.length).toBe(provider.supportedLayers.length);
    expect(opts[0]?.nativeWms).toBe(false);
  });
});
