import { describe, expect, it } from 'vitest';
import {
  buildExploreIndexPreviewPixels,
  sampleBurnScarIndex,
  sampleNdviAgricultureIndex,
  sampleNdwiWaterIndex,
  SI_EXPLORE_INDEX_PREVIEW_SIZE,
} from './siExploreIndexPreviewRaster';

describe('siExploreIndexPreviewRaster', () => {
  it('produces varied NDVI values across agricultural parcels', () => {
    const samples = [
      sampleNdviAgricultureIndex(0.2, 0.3),
      sampleNdviAgricultureIndex(0.5, 0.5),
      sampleNdviAgricultureIndex(0.75, 0.7),
    ];
    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread).toBeGreaterThan(0.15);
  });

  it('marks reservoir pixels as negative NDVI (water)', () => {
    expect(sampleNdviAgricultureIndex(0.34, 0.6)).toBeLessThan(-0.1);
  });

  it('marks stressed corner with lower NDVI than healthy fields', () => {
    const stressed = sampleNdviAgricultureIndex(0.92, 0.08);
    const healthy = sampleNdviAgricultureIndex(0.25, 0.28);
    expect(stressed).toBeLessThan(healthy);
  });

  it('NDWI scene yields high values over water bodies', () => {
    expect(sampleNdwiWaterIndex(0.45, 0.5)).toBeGreaterThan(0.25);
    expect(sampleNdwiWaterIndex(0.1, 0.1)).toBeLessThan(0.2);
  });

  it('burn scar core is strongly negative', () => {
    expect(sampleBurnScarIndex(0.55, 0.45)).toBeLessThan(-0.2);
  });

  it('renders NDVI raster with field-like color diversity (not a flat gradient)', () => {
    const pixels = buildExploreIndexPreviewPixels('ndvi', SI_EXPLORE_INDEX_PREVIEW_SIZE);

    let redDominant = 0;
    let yellowDominant = 0;
    let greenDominant = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      if (r > g + 20 && r > b + 10) redDominant += 1;
      if (g > 80 && r > 120 && g < r + 30) yellowDominant += 1;
      if (g > r + 15 && g > b + 15) greenDominant += 1;
    }
    expect(redDominant).toBeGreaterThan(20);
    expect(yellowDominant + greenDominant).toBeGreaterThan(80);
  });
});
