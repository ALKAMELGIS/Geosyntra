import { describe, expect, it } from 'vitest';
import { pixelDetectionsToGeoJson, pixelRectToGeoBounds } from './geoCartAiProjection';

describe('geoCartAiProjection', () => {
  const imageSize = { width: 1000, height: 1000 };
  const geoBounds = { west: 0, south: 0, east: 1, north: 1 };

  it('maps full image to geo bounds', () => {
    const b = pixelRectToGeoBounds({ x: 0, y: 0, width: 1000, height: 1000 }, imageSize, geoBounds);
    expect(b.west).toBeCloseTo(0);
    expect(b.east).toBeCloseTo(1);
    expect(b.north).toBeCloseTo(1);
    expect(b.south).toBeCloseTo(0);
  });

  it('maps center pixel box to geographic center', () => {
    const b = pixelRectToGeoBounds({ x: 400, y: 400, width: 200, height: 200 }, imageSize, geoBounds);
    expect(b.west).toBeCloseTo(0.4);
    expect(b.east).toBeCloseTo(0.6);
    expect(b.north).toBeCloseTo(0.6);
    expect(b.south).toBeCloseTo(0.4);
  });

  it('converts detection batch to GeoJSON', () => {
    const fc = pixelDetectionsToGeoJson(
      [{ x: 100, y: 100, width: 50, height: 50, className: 'building', score: 0.9 }],
      imageSize,
      geoBounds,
    );
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.properties?.class).toBe('building');
  });
});
