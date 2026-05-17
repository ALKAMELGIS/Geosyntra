import { describe, expect, it } from 'vitest';
import { buildProviderLayerOptions } from './provider-layer-mapper';
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

  it('returns Planet catalog layers when WMS bridge is missing', () => {
    const opts = buildProviderLayerOptions('planet-labs', [], HIDDEN);
    const provider = getSatelliteProvider('planet-labs');
    expect(opts.length).toBe(provider.supportedLayers.length);
    expect(opts[0]?.nativeWms).toBe(false);
  });
});
