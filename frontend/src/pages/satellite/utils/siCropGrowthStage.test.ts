import { describe, expect, it } from 'vitest';
import {
  buildAgHealthPieSlices,
  classifyCropGrowthStage,
  formatNumericRangeDisplay,
  parseNumericRange,
  stageForReportTableRow,
} from './siCropGrowthStage';

describe('siCropGrowthStage', () => {
  it('parses and formats numeric ranges without Index prefix', () => {
    expect(parseNumericRange('Index -0.5..-0.2')).toEqual({ min: -0.5, max: -0.2 });
    expect(formatNumericRangeDisplay('Index 0.6..1')).toBe('0.6..1');
    expect(formatNumericRangeDisplay('-0.5', 0.3)).toBe('-0.5..0.3');
  });

  it('classifies uncultivated land for bare soil bands', () => {
    const stage = classifyCropGrowthStage({
      activeLayerId: 'NDVI',
      bandMin: -0.5,
      bandMax: -0.2,
      ndviMean: -0.1,
      ndmiMean: -0.2,
    });
    expect(stage).toBe('Uncultivated Land');
  });

  it('classifies peak for dense canopy with adequate moisture', () => {
    const stage = classifyCropGrowthStage({
      activeLayerId: 'NDVI',
      bandMin: 0.6,
      bandMax: 1,
      meanInBand: 0.72,
      ndviMean: 0.68,
      ndmiMean: 0.08,
    });
    expect(stage).toBe('Peak');
  });

  it('classifies stress when vigor is moderate but moisture is low', () => {
    const stage = classifyCropGrowthStage({
      activeLayerId: 'NDVI',
      bandMin: 0.25,
      bandMax: 0.35,
      meanInBand: 0.3,
      ndviMean: 0.31,
      ndmiMean: -0.14,
    });
    expect(stage).toBe('Stress');
  });

  it('maps report table rows to stages', () => {
    const stage = stageForReportTableRow(
      { key: 'lb5', labelEn: '0.6 – 1', pct: 47, areaKm2: 7.94 },
      { activeLayerId: 'NDVI', ndviMean: 0.55, ndmiMean: 0.02, eviMean: null },
    );
    expect(stage).toBe('Peak');
  });

  it('aggregates legend bands into agricultural health pie slices', () => {
    const report = {
      indexId: 'NDVI' as const,
      tableRows: [
        { key: 'a', labelEn: '-0.5 – -0.2', pct: 35.3, areaKm2: 5.96 },
        { key: 'b', labelEn: '0.6 – 1', pct: 47.1, areaKm2: 7.94 },
        { key: 'c', labelEn: '0.25 – 0.3', pct: 5.9, areaKm2: 0.99 },
      ],
      dataInsights: { indexRows: [{ indexId: 'NDVI', mean: 0.05 }] },
      liveLayerAnalysis: null,
    };
    const slices = buildAgHealthPieSlices(report as import('./siAoiVegetationReportModel').SiAoiReportModel);
    expect(slices.some(s => s.label === 'Bare soil')).toBe(true);
    expect(slices.some(s => s.label === 'Healthy')).toBe(true);
    const total = slices.reduce((a, s) => a + s.pct, 0);
    expect(total).toBeGreaterThan(80);
  });
});
