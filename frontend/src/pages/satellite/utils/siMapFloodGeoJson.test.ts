import { describe, expect, it } from 'vitest';
import { buildSiFloodGeoJsonBundle } from './siMapFloodGeoJson';
import type { SiRainFlowField } from './siMapRainFlowField';

function mockRaster(n: number) {
  return {
    cols: 2,
    rows: 2,
    inside: new Uint8Array(n).fill(1),
    elev: new Float32Array(n).fill(100),
    flowDir: new Int8Array(n).fill(3),
    accumulation: new Float32Array(n).fill(4),
    depth: new Float32Array(n).fill(0.6),
    velocity: new Float32Array(n).fill(0.3),
    runoff: new Float32Array(n).fill(0.2),
  };
}

describe('buildSiFloodGeoJsonBundle', () => {
  it('builds depth, risk, flow and velocity layers from field cells', () => {
    const field: SiRainFlowField = {
      cols: 2,
      rows: 2,
      cells: [
        {
          x: 10,
          y: 10,
          lng: 8.68,
          lat: 49.41,
          elev: 100,
          flowDir: 3,
          accumulation: 4,
          depth: 0.6,
          pool: 0.5,
          flood: 0.55,
          velocity: 0.35,
          risk: 'high',
        },
      ],
      streamlines: [],
      paths: [],
      raster: mockRaster(4),
      cellWidth: 20,
      cellHeight: 20,
      hasRealDem: false,
      clippedToAoi: true,
      simulatedHours: 6,
    };
    const bundle = buildSiFloodGeoJsonBundle(field);
    expect(bundle?.depth.features.length).toBe(1);
    expect(bundle?.risk.features[0]?.properties?.risk).toBe('high');
    expect(bundle?.flowDir.features.length).toBe(1);
    expect(bundle?.velocity.features.length).toBe(1);
  });
});
