import { describe, expect, it } from 'vitest';
import { indexOverlayLikelyFromSamples } from './siMapViewerSnapshot';

function grid(fill: { r: number; g: number; b: number }, n = 81) {
  return Array.from({ length: n }, () => ({ ...fill }));
}

describe('indexOverlayLikelyFromSamples', () => {
  it('returns false for uniform natural-green basemap only', () => {
    expect(indexOverlayLikelyFromSamples(grid({ r: 61, g: 92, b: 58 }))).toBe(false);
  });

  it('returns true when classified index colors are present', () => {
    const samples = grid({ r: 74, g: 103, b: 65 });
    samples[10] = { r: 215, g: 48, b: 39 };
    samples[22] = { r: 254, g: 224, b: 139 };
    samples[40] = { r: 26, g: 152, b: 80 };
    samples[55] = { r: 215, g: 48, b: 39 };
    samples[60] = { r: 26, g: 152, b: 80 };
    samples[70] = { r: 254, g: 224, b: 139 };
    expect(indexOverlayLikelyFromSamples(samples)).toBe(true);
  });
});
