import { describe, expect, it } from 'vitest';
import { prepareGeoJsonInBackground } from './siMapLayerGeoJsonWorkerClient';

describe('siMapLayerGeoJsonWorkerClient', () => {
  it('prepareGeoJsonInBackground clones geojson and counts features', async () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: {} },
      ],
    };
    const out = await prepareGeoJsonInBackground(input);
    expect(out.featureCount).toBe(2);
    expect(out.geojson).not.toBe(input);
    expect(out.geojson).toEqual(input);
  });
});
