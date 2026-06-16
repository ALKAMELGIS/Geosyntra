import { describe, expect, it } from 'vitest';
import { siFormatHex6 } from '../../../lib/siWmsIndexClassificationRamp';
import {
  computeAoiRasterValueRange,
  siWmsApplyDynamicAoiStretch,
  siWmsBuildAoiHistogramStretchStops,
} from './siWmsDynamicPixelClassification';
import {
  SI_WMS_SPECTRAL_STOP_COUNT,
  siWmsAutoSpectralStops,
  siWmsResolveCanonicalStops,
} from './siWmsSpectralClassification';
import { siWmsDefaultStopsForLayer } from './siWmsSymbologyModel';

describe('siWmsDynamicPixelClassification', () => {
  it('detects uniform AOI pixel range', () => {
    const range = computeAoiRasterValueRange([0.42, 0.42, 0.42]);
    expect(range?.isUniform).toBe(true);
    expect(range?.min).toBe(0.42);
    expect(range?.max).toBe(0.42);
  });

  it('stretches narrow NDVI AOI range into 10 distinct color classes', () => {
    const scientific = siWmsDefaultStopsForLayer('NDVI')!;
    const stops = siWmsBuildAoiHistogramStretchStops(scientific, 0.45, 0.52);
    expect(stops.length).toBe(SI_WMS_SPECTRAL_STOP_COUNT);
    expect(stops[0]![0]).toBeCloseTo(0.45, 6);
    expect(stops[stops.length - 1]![0]).toBeCloseTo(0.52, 6);

    const colors = new Set(stops.map(s => siFormatHex6(s[1]).toLowerCase()));
    expect(colors.size).toBeGreaterThan(1);
  });

  it('uniform AOI still yields 10 distinct classified stop colors (no single-color ramp)', () => {
    const scientific = siWmsDefaultStopsForLayer('NDVI')!;
    const stops = siWmsBuildAoiHistogramStretchStops(scientific, 0.33, 0.33);
    expect(stops.length).toBe(SI_WMS_SPECTRAL_STOP_COUNT);
    const colors = new Set(stops.map(s => siFormatHex6(s[1]).toLowerCase()));
    expect(colors.size).toBeGreaterThan(1);
  });

  it('DRI AOI stretch yields 10 distinct colors for narrow value range', () => {
    const scientific = siWmsDefaultStopsForLayer('DRI')!;
    const narrow = Array.from({ length: 80 }, (_, i) => 0.32 + (i / 79) * 0.08);
    const stretched = siWmsResolveCanonicalStops('DRI', undefined, narrow);
    expect(stretched?.length).toBe(SI_WMS_SPECTRAL_STOP_COUNT);
    const colors = new Set(stretched!.map(s => siFormatHex6(s[1]).toLowerCase()));
    expect(colors.size).toBeGreaterThanOrEqual(8);
    expect(stretched?.[0]![0]).toBeCloseTo(0.32, 6);
    expect(stretched?.[stretched!.length - 1]![0]).toBeCloseTo(0.4, 6);
  });

  it('applies AOI stretch via resolve when pixel values are provided', () => {
    const global = siWmsAutoSpectralStops('NDVI')!;
    const narrow = Array.from({ length: 120 }, (_, i) => 0.44 + (i / 119) * 0.06);
    const stretched = siWmsResolveCanonicalStops('NDVI', undefined, narrow);
    expect(stretched).not.toEqual(global);
    expect(stretched?.[0]![0]).toBeCloseTo(0.44, 6);
    expect(stretched?.[stretched!.length - 1]![0]).toBeCloseTo(0.5, 6);

    const globalColors = new Set(global.map(s => s[1]));
    const stretchedColors = new Set(stretched!.map(s => s[1]));
    expect(stretchedColors.size).toBeGreaterThanOrEqual(globalColors.size);
  });

  it('CHS AOI stretch yields 10 distinct classified colors', () => {
    const scientific = siWmsDefaultStopsForLayer('CHS')!;
    const narrow = Array.from({ length: 80 }, (_, i) => 0.32 + (i / 79) * 0.08);
    const stretched = siWmsResolveCanonicalStops('CHS', undefined, narrow);
    expect(stretched?.length).toBe(SI_WMS_SPECTRAL_STOP_COUNT);
    const colors = new Set(stretched!.map(s => siFormatHex6(s[1]).toLowerCase()));
    expect(colors.size).toBeGreaterThanOrEqual(8);
    expect(stretched?.[0]![0]).toBeCloseTo(0.32, 6);
    expect(stretched?.[stretched!.length - 1]![0]).toBeCloseTo(0.4, 6);
  });
});
