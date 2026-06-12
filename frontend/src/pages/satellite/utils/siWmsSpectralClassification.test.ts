import { describe, expect, it } from 'vitest';
import { siFormatHex6 } from '../../../lib/siWmsIndexClassificationRamp';
import {
  SI_WMS_SPECTRAL_CLASS_COUNT,
  SI_WMS_SPECTRAL_STOP_COUNT,
  siWmsAutoSpectralStops,
  siWmsLegendRowsFromStops,
  siWmsResolveCanonicalStops,
} from './siWmsSpectralClassification';

describe('siWmsSpectralClassification', () => {
  it('produces exactly 10 legend classes for NDVI from scientific ramp', () => {
    const stops = siWmsAutoSpectralStops('NDVI');
    expect(stops).not.toBeNull();
    expect(stops!.length).toBe(SI_WMS_SPECTRAL_STOP_COUNT);
    const rows = siWmsLegendRowsFromStops(stops);
    expect(rows.length).toBe(SI_WMS_SPECTRAL_CLASS_COUNT);
    expect(siFormatHex6(stops![0]![1]).toLowerCase()).toMatch(/^#[89a-f0-9]/);
  });

  it('uses same stops for map and legend via resolve', () => {
    const a = siWmsResolveCanonicalStops('NDWI');
    const b = siWmsResolveCanonicalStops('NDWI');
    expect(a).toEqual(b);
    expect(siWmsLegendRowsFromStops(a).length).toBe(SI_WMS_SPECTRAL_CLASS_COUNT);
  });

  it('NDWI ramp spans green → white → blue (McFeeters)', () => {
    const stops = siWmsAutoSpectralStops('NDWI');
    expect(stops).not.toBeNull();
    expect(siFormatHex6(stops![0]![1]).toLowerCase()).toBe('#008000');
    const mid = stops![Math.floor(stops!.length / 2)]!;
    expect(siFormatHex6(mid[1]).toLowerCase()).toBe('#ffffff');
    expect(siFormatHex6(stops![stops!.length - 1]![1]).toLowerCase()).toBe('#0000cc');
    expect(siWmsLegendRowsFromStops(stops).length).toBe(SI_WMS_SPECTRAL_CLASS_COUNT);
  });

  it('supports SAVI and LST layer ids with 10 classes each', () => {
    expect(siWmsAutoSpectralStops('SAVI')?.length).toBe(SI_WMS_SPECTRAL_STOP_COUNT);
    expect(siWmsAutoSpectralStops('LST')?.length).toBe(SI_WMS_SPECTRAL_STOP_COUNT);
  });

  it('uses distinct color ramps per scientific index type', () => {
    const ndvi = siWmsAutoSpectralStops('NDVI')!;
    const ndwi = siWmsAutoSpectralStops('NDWI')!;
    const savi = siWmsAutoSpectralStops('SAVI')!;
    expect(ndvi[0]![1]).not.toBe(ndwi[0]![1]);
    expect(savi[0]![1]).not.toBe(ndvi[0]![1]);
    expect(siFormatHex6(ndwi[ndwi.length - 1]![1]).toLowerCase()).toBe('#0000cc');
  });
});
