import { describe, expect, it } from 'vitest';
import { loadStoredSiMapProjectionMode, loadStoredSiTerrainExaggeration } from './siMapProjectionTerrain';

describe('siMapProjectionTerrain', () => {
  it('defaults projection to globe', () => {
    expect(loadStoredSiMapProjectionMode()).toBe('globe');
  });

  it('clamps terrain exaggeration', () => {
    expect(loadStoredSiTerrainExaggeration()).toBeGreaterThanOrEqual(0.5);
    expect(loadStoredSiTerrainExaggeration()).toBeLessThanOrEqual(3);
  });
});
