import { describe, expect, it } from 'vitest';
import {
  SI_WMS_SPECTRAL_CLASS_COUNT,
  siWmsAutoSpectralStops,
  siWmsLegendRowsFromStops,
  siWmsResolveCanonicalStops,
} from './siWmsSpectralClassification';

describe('siWmsSpectralClassification', () => {
  it('produces 10 legend classes for NDVI', () => {
    const stops = siWmsAutoSpectralStops('NDVI');
    expect(stops).not.toBeNull();
    expect(stops!.length).toBeGreaterThanOrEqual(SI_WMS_SPECTRAL_CLASS_COUNT);
    const rows = siWmsLegendRowsFromStops(stops);
    expect(rows.length).toBe(SI_WMS_SPECTRAL_CLASS_COUNT);
  });

  it('uses same stops for map and legend via resolve', () => {
    const a = siWmsResolveCanonicalStops('NDWI');
    const b = siWmsResolveCanonicalStops('NDWI');
    expect(a).toEqual(b);
    expect(siWmsLegendRowsFromStops(a).length).toBe(SI_WMS_SPECTRAL_CLASS_COUNT);
  });

  it('NDWI ramp ends in white (open water) not purple qualitative', () => {
    const stops = siWmsAutoSpectralStops('NDWI');
    expect(stops).not.toBeNull();
    const topHex = stops![stops!.length - 1]![1];
    expect(topHex).toBe(0xffffff);
    const rows = siWmsLegendRowsFromStops(stops);
    expect(rows[rows.length - 1]!.color.toLowerCase()).toBe('#ffffff');
  });

  it('supports SAVI and LST layer ids', () => {
    expect(siWmsAutoSpectralStops('SAVI')?.length).toBeGreaterThanOrEqual(2);
    expect(siWmsAutoSpectralStops('LST')?.length).toBeGreaterThanOrEqual(2);
  });
});
