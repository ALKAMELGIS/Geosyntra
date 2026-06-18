import { describe, expect, it } from 'vitest';
import {
  buildNdviInterpretationText,
  classifyNdviMeanToCondition,
  classifyNdviPixelDensity,
  SI_NDVI_DENSITY_CLASS_BANDS,
} from './liveAoiIndexAnalysis';
import { SI_NDVI_CULTIVATED_MIN } from './siIndexClassAnalytics';

describe('liveAoiIndexAnalysis', () => {
  it('classifies pixel density bands', () => {
    expect(classifyNdviPixelDensity(0.1)).toBe('Non-Vegetation');
    expect(classifyNdviPixelDensity(0.25)).toBe('Sparse Vegetation');
    expect(classifyNdviPixelDensity(0.5)).toBe('Moderate Vegetation');
    expect(classifyNdviPixelDensity(0.72)).toBe('Healthy Vegetation');
  });

  it('maps mean NDVI to vegetation condition', () => {
    expect(classifyNdviMeanToCondition(0.1)).toBe('Poor');
    expect(classifyNdviMeanToCondition(0.3)).toBe('Moderate');
    expect(classifyNdviMeanToCondition(0.5)).toBe('Good');
    expect(classifyNdviMeanToCondition(0.7)).toBe('Excellent');
  });

  it('builds interpretation sentence', () => {
    const text = buildNdviInterpretationText({
      cultivatedAreaHa: 12.34,
      cultivatedPct: 67.8,
      condition: 'Good',
    });
    expect(text).toContain('12.34');
    expect(text).toContain('Good');
    expect(text).toContain('67.8%');
  });

  it('documents four NDVI class bands', () => {
    expect(SI_NDVI_DENSITY_CLASS_BANDS).toHaveLength(4);
    expect(SI_NDVI_CULTIVATED_MIN).toBe(0.2);
  });
});
