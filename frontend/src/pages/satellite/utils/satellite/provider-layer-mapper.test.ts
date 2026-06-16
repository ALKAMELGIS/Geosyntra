import { describe, expect, it } from 'vitest';
import {
  appendCollectionLayerLiveOptions,
  appendLayerLiveEvalLayerOptions,
  buildProviderLayerOptions,
  filterRemoteSensingLayerOptionsForMapCanvas,
  isLayerLiveEvalOnlyLayerId,
  isLayerLiveMapCanvasSupported,
  normalizeWmsLayerDisplayTitle,
  resolveDefaultAoiDrawWmsLayerId,
  resolveWmsTileLayerName,
} from './provider-layer-mapper';
import { SENTINEL_1_GRD_COLLECTION_ID } from '../../../../lib/siSentinel1InsarLayerCatalog';
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

  it('shortens Sentinel Hub Moisture Index title to NDMI', () => {
    expect(normalizeWmsLayerDisplayTitle('NDMI', 'Moisture index')).toBe('NDMI');
    expect(normalizeWmsLayerDisplayTitle('MOISTURE_INDEX', 'Moisture index')).toBe('NDMI');
    expect(normalizeWmsLayerDisplayTitle('SOME_LAYER', 'Moisture Index')).toBe('NDMI');
    const wms = [{ name: 'NDMI', title: 'Moisture Index' }];
    const opts = buildProviderLayerOptions('sentinel-hub', wms, HIDDEN);
    expect(opts[0]?.label).toBe('NDMI');
  });

  it('keeps NDWI when API title is Moisture Index (NDWI)', () => {
    expect(normalizeWmsLayerDisplayTitle('NDWI', 'Moisture Index (NDWI)')).toBe('NDWI');
  });

  it('appends virtual SAVI when GetCapabilities omits it', () => {
    const wms = [{ name: 'NDVI', title: 'NDVI' }];
    const base = buildProviderLayerOptions('sentinel-hub', wms, HIDDEN);
    const opts = appendLayerLiveEvalLayerOptions(base, 'sentinel-hub');
    expect(opts.some(o => o.id === 'SAVI' && o.label === 'SAVI' && !o.nativeWms)).toBe(true);
    expect(isLayerLiveEvalOnlyLayerId('SAVI')).toBe(true);
  });

  it('does not duplicate SAVI when already in GetCapabilities', () => {
    const wms = [
      { name: 'NDVI', title: 'NDVI' },
      { name: 'SAVI', title: 'SAVI' },
    ];
    const opts = appendLayerLiveEvalLayerOptions(
      buildProviderLayerOptions('sentinel-hub', wms, HIDDEN),
      'sentinel-hub',
    );
    expect(opts.filter(o => o.label === 'SAVI').length).toBe(1);
    expect(opts.find(o => o.id === 'SAVI')?.nativeWms).toBe(true);
  });

  it('resolves WMS tile layer fallback for eval-only SAVI', () => {
    const wms = [
      { name: 'TRUE_COLOR', title: 'True color' },
      { name: 'NDVI', title: 'NDVI' },
    ];
    expect(resolveWmsTileLayerName('SAVI', wms)).toBe('TRUE_COLOR');
    expect(resolveWmsTileLayerName('NDVI', wms)).toBe('NDVI');
  });

  it('prefers VV-VH SAR Urban over empty HH-HV tiles in sentinel-1-grd collection', () => {
    const wms = [
      { name: '9_SAR-URBAN-HH-HV', title: 'SAR Urban' },
      { name: '9_SAR-URBAN-VV-VH', title: 'SAR Urban' },
      { name: '8_RGB-RATIO-HH-HV', title: 'RGB Ratio' },
      { name: '8_RGB-RATIO-VV-VH', title: 'RGB Ratio' },
    ];
    const opts = buildProviderLayerOptions('sentinel-hub', wms, HIDDEN, SENTINEL_1_GRD_COLLECTION_ID);
    expect(opts.map(o => o.id).sort()).toEqual(['8_RGB-RATIO-VV-VH', '9_SAR-URBAN-VV-VH']);
    expect(resolveWmsTileLayerName('9_SAR-URBAN-HH-HV', wms)).toBe('9_SAR-URBAN-VV-VH');
    expect(resolveWmsTileLayerName('8_RGB-RATIO-HH-HV', wms)).toBe('8_RGB-RATIO-VV-VH');
  });

  it('shows Sentinel-1 InSAR layers when sentinel-1-grd collection is active', () => {
    const wms = [
      { name: 'NDVI', title: 'NDVI' },
      { name: 'IW-DV-VV-LINEAR-GAMMA0-ORTHORECTIFIED', title: 'S1 VV linear' },
      { name: 'IW-DV-VH-LINEAR-GAMMA0-ORTHORECTIFIED', title: 'S1 VH linear' },
      { name: '9_SAR-URBAN-VV-VH', title: 'SAR urban mosaic' },
    ];
    const base = buildProviderLayerOptions('sentinel-hub', wms, HIDDEN, SENTINEL_1_GRD_COLLECTION_ID);
    const opts = appendCollectionLayerLiveOptions(base, 'sentinel-hub', SENTINEL_1_GRD_COLLECTION_ID);
    expect(opts.some(o => o.id === 'NDVI')).toBe(false);
    expect(opts.some(o => o.id === 'LOS_DISP' && o.sciCode === 'LOS Disp')).toBe(true);
    expect(opts.some(o => o.id === 'SMI' && !o.nativeWms)).toBe(true);
    expect(opts.some(o => o.id === 'IW-DV-VH-LINEAR-GAMMA0-ORTHORECTIFIED')).toBe(true);
    expect(isLayerLiveEvalOnlyLayerId('COH')).toBe(true);
    expect(resolveWmsTileLayerName('LOS_DISP', wms)).toBe('IW-DV-VH-LINEAR-GAMMA0-ORTHORECTIFIED');
  });

  it('hides optical eval layers for sentinel-1-grd collection', () => {
    const wms = [{ name: 'NDVI', title: 'NDVI' }];
    const opts = appendCollectionLayerLiveOptions(
      buildProviderLayerOptions('sentinel-hub', wms, HIDDEN, SENTINEL_1_GRD_COLLECTION_ID),
      'sentinel-hub',
      SENTINEL_1_GRD_COLLECTION_ID,
    );
    expect(opts.some(o => o.id === 'SAVI')).toBe(false);
    expect(opts.some(o => o.id === 'VHS')).toBe(false);
    expect(opts.some(o => o.id === 'DEFO')).toBe(true);
  });

  it('appends agro composite layers for Layer Live (no delta change layers)', () => {
    const wms = [{ name: 'NDVI', title: 'NDVI' }];
    const opts = appendLayerLiveEvalLayerOptions(
      buildProviderLayerOptions('sentinel-hub', wms, HIDDEN),
      'sentinel-hub',
    );
    expect(opts.some(o => o.id === 'VHS' && o.sciCode === 'VHS')).toBe(true);
    expect(opts.some(o => o.id.startsWith('DELTA_'))).toBe(false);
    expect(opts.filter(o => !o.nativeWms).length).toBeGreaterThanOrEqual(20);
    expect(isLayerLiveEvalOnlyLayerId('CPI')).toBe(true);
    expect(opts.some(o => o.id === 'CCI' && o.sciCode === 'CCI')).toBe(true);
    expect(resolveWmsTileLayerName('VHS', wms)).toBe('NDVI');
  });
});

describe('isLayerLiveMapCanvasSupported', () => {
  const s2Wms = [
    { name: 'NDVI', title: 'NDVI' },
    { name: '2_FALSE_COLOR', title: 'False color' },
    { name: 'NDSI', title: 'NDSI' },
  ];

  it('keeps spectral indices with evalscript support', () => {
    expect(isLayerLiveMapCanvasSupported('NDVI', s2Wms, 'sentinel-2-l2a')).toBe(true);
    expect(isLayerLiveMapCanvasSupported('VHS', s2Wms, 'sentinel-2-l2a')).toBe(true);
  });

  it('drops RGB / native-only WMS layers from Map Canvas pickers', () => {
    expect(isLayerLiveMapCanvasSupported('2_FALSE_COLOR', s2Wms, 'sentinel-2-l2a')).toBe(false);
    expect(isLayerLiveMapCanvasSupported('NDSI', s2Wms, 'sentinel-2-l2a')).toBe(false);
  });

  it('filters provider options to Map Canvas–ready layers only', () => {
    const opts = appendLayerLiveEvalLayerOptions(
      buildProviderLayerOptions('sentinel-hub', s2Wms, HIDDEN),
      'sentinel-hub',
    );
    const filtered = filterRemoteSensingLayerOptionsForMapCanvas(
      opts.filter(o => o.nativeWms || isLayerLiveEvalOnlyLayerId(o.id)),
      s2Wms,
      'sentinel-2-l2a',
    );
    expect(filtered.some(o => o.id === 'NDVI')).toBe(true);
    expect(filtered.some(o => o.id === 'VHS')).toBe(true);
    expect(filtered.some(o => o.id === '2_FALSE_COLOR')).toBe(false);
    expect(filtered.some(o => o.id === 'NDSI')).toBe(false);
  });
});
