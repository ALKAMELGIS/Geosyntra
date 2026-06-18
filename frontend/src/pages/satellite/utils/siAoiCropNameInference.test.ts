import { describe, expect, it } from 'vitest';
import {
  appendCropDiseaseToTemporalForecast,
  buildCropDiseaseForecast,
  inferCropFromAoiName,
} from './siAoiCropNameInference';

describe('siAoiCropNameInference', () => {
  it('infers crop only from AOI name keywords', () => {
    expect(inferCropFromAoiName('North Wheat Field')?.id).toBe('wheat');
    expect(inferCropFromAoiName('حقل قمح 12')?.id).toBe('wheat');
    expect(inferCropFromAoiName('Parcel A-07')).toBeNull();
  });

  it('builds crop-specific disease forecast from Live Index context', () => {
    const forecast = buildCropDiseaseForecast('Corn Block 3', {
      ndviMean: 0.21,
      ndmiMean: -0.12,
      lstMeanC: 33.5,
      soilMoisturePct: 28,
      heatRiskLabel: 'Moderate',
      stressedAreaPct: 14,
      liveLayerLabel: 'NDVI',
    });
    expect(forecast?.crop.id).toBe('corn');
    expect(forecast?.likelyDiseases.length).toBeGreaterThan(0);
    expect(forecast?.summary).toMatch(/Live Index/i);
    expect(forecast?.summary).toMatch(/NDMI/i);
  });

  it('does not append crop note when AOI has no crop keyword', () => {
    const line = 'Temporal Insight & Forecast: stability expected.';
    const out = appendCropDiseaseToTemporalForecast(line, 'Field 9', {
      ndviMean: 0.4,
      ndmiMean: 0.05,
      lstMeanC: 29,
      soilMoisturePct: 50,
      heatRiskLabel: 'Low',
      stressedAreaPct: 5,
      liveLayerLabel: 'NDVI',
    });
    expect(out).toBe(line);
  });
});
