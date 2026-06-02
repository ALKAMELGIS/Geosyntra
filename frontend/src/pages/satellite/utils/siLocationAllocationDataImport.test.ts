import { describe, expect, it } from 'vitest';
import {
  buildLaInputPointsGeoJson,
  laPointsFromGeoJson,
  laPointsToText,
  mergeLaPoints,
} from './siLocationAllocationDataImport';
import {
  DEFAULT_LA_ALLOCATION_SYMBOLOGY,
  laLineDashArray,
  laMainLineWidth,
} from './siLocationAllocationSymbology';

describe('siLocationAllocationDataImport', () => {
  it('extracts points from GeoJSON FeatureCollection', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { name: 'Site A', weight: 3 },
          geometry: { type: 'Point' as const, coordinates: [55.1, 25.2] },
        },
      ],
    };
    const pts = laPointsFromGeoJson(fc, 'dem');
    expect(pts).toHaveLength(1);
    expect(pts[0]?.lng).toBe(55.1);
    expect(pts[0]?.weight).toBe(3);
  });

  it('merges without duplicate nearby points', () => {
    const a = [{ id: 'a', lng: 55, lat: 25, label: 'A' }];
    const b = [{ id: 'b', lng: 55.00001, lat: 25.00001, label: 'B' }];
    expect(mergeLaPoints(a, b)).toHaveLength(1);
  });

  it('buildLaInputPointsGeoJson tags role', () => {
    const gj = buildLaInputPointsGeoJson(
      [{ id: 'f1', lng: 1, lat: 2, label: 'F1' }],
      'la-input-facility',
    );
    expect(gj.features[0]?.properties?.role).toBe('la-input-facility');
  });

  it('laPointsToText round-trips labels', () => {
    const text = laPointsToText([{ id: 'x', lng: 55.1, lat: 25.2, label: 'Hub' }]);
    expect(text).toContain('25.20000');
    expect(text).toContain('Hub');
  });
});

describe('siLocationAllocationSymbology', () => {
  it('defaults to high-visibility white line', () => {
    expect(DEFAULT_LA_ALLOCATION_SYMBOLOGY.lineColor).toBe('#FFFFFF');
    expect(laMainLineWidth(DEFAULT_LA_ALLOCATION_SYMBOLOGY)).toBeGreaterThanOrEqual(3);
  });

  it('maps line styles to dash arrays', () => {
    expect(laLineDashArray('dashed')).toEqual([4, 3]);
    expect(laLineDashArray('solid')).toBeUndefined();
  });
});
