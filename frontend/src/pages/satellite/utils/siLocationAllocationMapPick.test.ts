import { describe, expect, it } from 'vitest';
import {
  appendLaPoint,
  appendLaPointLine,
  pickLaPointFromMapLayers,
} from './siLocationAllocationMapPick';

describe('siLocationAllocationMapPick', () => {
  it('picks nearest visible point feature within tolerance', () => {
    const layers = [
      {
        id: 'hospitals',
        name: 'Hospitals',
        visible: true,
        geojson: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              properties: { name: 'General Hospital' },
              geometry: { type: 'Point' as const, coordinates: [-122.42, 37.78] },
            },
          ],
        },
      },
      {
        id: 'hidden',
        name: 'Hidden',
        visible: false,
        geojson: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Point' as const, coordinates: [-122.42, 37.78] },
            },
          ],
        },
      },
    ];

    const picked = pickLaPointFromMapLayers(-122.4199, 37.7799, layers, { prefix: 'fac' });
    expect(picked).not.toBeNull();
    expect(picked?.label).toBe('General Hospital');
    expect(picked?.id).toContain('fac-hospitals');
  });

  it('returns null when no feature is within tolerance', () => {
    const layers = [
      {
        id: 'far',
        name: 'Far',
        visible: true,
        geojson: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Point' as const, coordinates: [0, 0] },
            },
          ],
        },
      },
    ];
    expect(pickLaPointFromMapLayers(-122.42, 37.78, layers)).toBeNull();
  });

  it('appends coordinate lines for manual map clicks', () => {
    expect(appendLaPointLine('', 37.78, -122.42)).toBe('37.78000, -122.42000');
    expect(appendLaPointLine('1, 2', 3, 4)).toBe('1, 2\n3.00000, 4.00000');
  });

  it('appends labeled layer picks', () => {
    const text = appendLaPoint('', {
      id: 'fac-1',
      lat: 37.78,
      lng: -122.42,
      label: 'Store A',
    });
    expect(text).toContain('Store A');
    expect(text).toContain('37.78000');
  });
});
