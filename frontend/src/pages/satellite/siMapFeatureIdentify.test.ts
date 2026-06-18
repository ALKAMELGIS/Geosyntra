import { describe, expect, it } from 'vitest';
import { siVectorLayerIdToCustomSourceId, siMapboxLayerIdToAppLayerId } from './siMapFeatureIdentify';

describe('siVectorLayerIdToCustomSourceId', () => {
  it('parses style-key instance ids (layerId--styleKey-suffix)', () => {
    expect(siVectorLayerIdToCustomSourceId('arcgis-1--agpv_1_2_r3-fill')).toBe('arcgis-1');
    expect(siVectorLayerIdToCustomSourceId('custom-9--fd_1-line')).toBe('custom-9');
  });

  it('parses extrusion suffix ids', () => {
    expect(siVectorLayerIdToCustomSourceId('arcgis-1--agpv_1_2_r3-extrusion')).toBe('arcgis-1');
  });

  it('parses legacy ids without style key', () => {
    expect(siVectorLayerIdToCustomSourceId('legacy-layer-fill')).toBe('legacy-layer');
  });

  it('returns null for non-vector layers', () => {
    expect(siVectorLayerIdToCustomSourceId('si-terrain-contours')).toBeNull();
  });
});

describe('siMapboxLayerIdToAppLayerId', () => {
  it('returns app layer id for styled mapbox ids', () => {
    expect(siMapboxLayerIdToAppLayerId('arcgis-1780257639552-dsk83--ps_c_sing-fill')).toBe(
      'arcgis-1780257639552-dsk83',
    );
  });

  it('returns app layer id for extrusion hits', () => {
    expect(siMapboxLayerIdToAppLayerId('custom-9--rev2-extrusion')).toBe('custom-9');
  });
});
