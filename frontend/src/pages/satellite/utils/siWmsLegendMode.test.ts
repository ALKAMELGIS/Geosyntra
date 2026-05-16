import { describe, expect, it } from 'vitest';
import { siWmsResolveLegendDisplayMode } from './siWmsLegendMode';

describe('siWmsResolveLegendDisplayMode', () => {
  it('returns none when layer hidden', () => {
    expect(
      siWmsResolveLegendDisplayMode({
        profile: 'ndvi',
        layerId: 'NDVI',
        sentinelVisible: false,
        hasAoiGeometry: true,
      }),
    ).toBe('none');
  });

  it('returns scientific when AOI + auto scientific', () => {
    expect(
      siWmsResolveLegendDisplayMode({
        profile: 'ndvi',
        layerId: 'NDVI',
        sentinelVisible: true,
        hasAoiGeometry: true,
        symbologyPartial: { autoScientific: true },
      }),
    ).toBe('scientific');
  });

  it('returns live when AOI but auto scientific off', () => {
    expect(
      siWmsResolveLegendDisplayMode({
        profile: 'ndvi',
        layerId: 'NDVI',
        sentinelVisible: true,
        hasAoiGeometry: true,
        symbologyPartial: { autoScientific: false },
      }),
    ).toBe('live');
  });

  it('returns live for RGB composite layers', () => {
    expect(
      siWmsResolveLegendDisplayMode({
        profile: 'true_color',
        layerId: 'TRUE_COLOR',
        sentinelVisible: true,
        hasAoiGeometry: true,
        symbologyPartial: { autoScientific: true },
      }),
    ).toBe('live');
  });
});
