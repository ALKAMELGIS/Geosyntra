import { describe, expect, it } from 'vitest';
import { SI_EXPLORE_INDEX_BANDS } from './siExploreIndexesCatalog';
import {
  exploreBandRenderProfile,
  renderExploreIndexValuesToImageData,
  resolveExploreBandChartLayerId,
} from './siExploreIndexThumbPipeline';
import { SI_NDVI_CLASSIFICATION_STOPS, SI_NDWI_CLASSIFICATION_STOPS } from '../../../lib/siWmsIndexClassificationRamp';

describe('siExploreIndexThumbPipeline', () => {
  it('maps band cards to chart layer ids', () => {
    const ndvi = SI_EXPLORE_INDEX_BANDS.find(b => b.id === 'ndvi')!;
    const ndwi = SI_EXPLORE_INDEX_BANDS.find(b => b.id === 'ndwi')!;
    const stack = SI_EXPLORE_INDEX_BANDS.find(b => b.id === 'index-stack')!;
    expect(resolveExploreBandChartLayerId(ndvi)).toBe('NDVI');
    expect(resolveExploreBandChartLayerId(ndwi)).toBe('NDWI');
    expect(resolveExploreBandChartLayerId(stack)).toBe('NDMI');
  });

  it('selects profile per band', () => {
    const ndvi = SI_EXPLORE_INDEX_BANDS.find(b => b.id === 'ndvi')!;
    const ndwi = SI_EXPLORE_INDEX_BANDS.find(b => b.id === 'ndwi')!;
    expect(exploreBandRenderProfile(ndvi)).toBe('ndvi');
    expect(exploreBandRenderProfile(ndwi)).toBe('ndwi');
  });

  it('renders water blues for negative NDVI pixels', () => {
    const values = new Float32Array([-0.35, 0.55]);
    const img = renderExploreIndexValuesToImageData(values, 2, 1, SI_NDVI_CLASSIFICATION_STOPS);
    expect(img.data[2]).toBeGreaterThan(img.data[0]);
    const g = img.data[5]!;
    const b = img.data[6]!;
    expect(g).toBeGreaterThan(40);
  });

  it('renders deep blues for high NDWI', () => {
    const values = new Float32Array([0.7]);
    const img = renderExploreIndexValuesToImageData(values, 1, 1, SI_NDWI_CLASSIFICATION_STOPS);
    expect(img.data[2]).toBeGreaterThan(img.data[0]);
  });
});
