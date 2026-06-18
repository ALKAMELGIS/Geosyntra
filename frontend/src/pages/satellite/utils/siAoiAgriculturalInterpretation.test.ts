import { describe, expect, it } from 'vitest';
import {
  buildSiAoiAgriculturalInterpretation,
  buildSiAoiInterpretationMetrics,
  classifySiAoiTemporalTrend,
  computeSiAoiRiskLevel,
  parseSiAoiAgriculturalInterpretationJson,
  resolveLatestImageryDate,
  SI_AOI_INTERPRETATION_INSIGHT_COUNT,
  SI_AOI_INTERPRETATION_RECOMMENDATION_COUNT,
} from './siAoiAgriculturalInterpretation';
import type { SiAoiReportModel } from './siAoiVegetationReportModel';

function minimalReport(): SiAoiReportModel {
  return {
    indexId: 'NDVI',
    indexLabel: 'NDVI',
    aoiName: 'Test field',
    dateStart: '2026-05-01',
    dateEnd: '2026-05-31',
    aoiAreaKm2: 1.2,
    summaryLinesEn: [],
    analysisEn: '',
    stressNoteEn: null,
    timeSeries: [{ date: '2026-05-15', value: 0.42 }],
    heatmapCellsGeoJson: { type: 'FeatureCollection', features: [] },
    aoiOutlineGeoJson: { type: 'FeatureCollection', features: [] },
    changeDetectionSlots: [],
    tableRows: [
      { key: 'high', labelEn: 'High vigor · 0.45..0.6', areaKm2: 0.8, pct: 55, colorHex: '#166534' },
      { key: 'medium', labelEn: 'Medium · 0.25..0.45', areaKm2: 0.3, pct: 25, colorHex: '#ca8a04' },
      { key: 'low', labelEn: 'Stress · 0.1..0.25', areaKm2: 0.1, pct: 20, colorHex: '#b91c1c' },
    ],
    dataInsights: {
      indexRows: [
        { indexId: 'NDVI', label: 'NDVI', min: 0.2, max: 0.6, mean: 0.42, std: 0.05, status: 'Moderate' },
        { indexId: 'NDWI', label: 'NDWI', min: -0.2, max: 0.1, mean: -0.05, std: 0.03, status: 'Moderate' },
        { indexId: 'SAVI', label: 'SAVI', min: 0.1, max: 0.5, mean: 0.35, std: 0.04, status: 'Moderate' },
        { indexId: 'LST', label: 'LST', min: 28, max: 36, mean: 32, std: 1.2, status: 'Moderate' },
      ],
      dashboard: {
        ndviAvg: 0.42,
        ndwiStatusLabel: 'Moderate',
        vegChangePct: -8,
        heatRiskLabel: 'Moderate',
        urbanExpansionPct: 2,
        barSeries: [],
        pieSlices: [],
        sparkNdvi: [0.4, 0.42],
      },
      executiveSummaryAi: null,
    },
    classificationPalette: {
      high: '#22c55e',
      medium: '#eab308',
      low: '#ef4444',
      aoiOutline: '#38bdf8',
    },
    legendBandCount: 5,
    reportStyleMode: 'SCIENTIFIC',
    reportType: 'AGRICULTURE',
  };
}

describe('siAoiAgriculturalInterpretation', () => {
  it('builds metrics with healthy vs stressed shares', () => {
    const report = minimalReport();
    const m = buildSiAoiInterpretationMetrics(report, report.dataInsights);
    expect(m.healthyAreaPct).toBe(55);
    expect(m.stressedAreaPct).toBe(20);
    expect(m.ndviMean).toBe(0.42);
  });

  it('produces 5 insights and 3 recommendations client-side', () => {
    const report = minimalReport();
    const ag = buildSiAoiAgriculturalInterpretation(report, report.dataInsights);
    expect(ag.insights).toHaveLength(SI_AOI_INTERPRETATION_INSIGHT_COUNT);
    expect(ag.recommendations).toHaveLength(SI_AOI_INTERPRETATION_RECOMMENDATION_COUNT);
    expect(['Low', 'Medium', 'High']).toContain(ag.riskLevel);
    expect(ag.cropCondition.length).toBeGreaterThan(20);
    expect(ag.yieldImpact.length).toBeGreaterThan(20);
    expect(ag.latestImageryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ag.temporalInsightForecast).toMatch(/^Temporal Insight & Forecast:/);
    expect(ag.insights[1]).toMatch(/ha\)/);
    expect(ag.insights[2]).toMatch(/NDMI/);
    expect(ag.insights[2]).toMatch(/NDWI/);
  });

  it('parses Gemini JSON payload', () => {
    const json = JSON.stringify({
      insights: ['a', 'b', 'c', 'd', 'e'],
      recommendations: ['r1', 'r2', 'r3'],
      riskLevel: 'Medium',
      riskCause: 'low NDMI + heat',
      cropCondition: 'Moderate crop.',
      yieldImpact: 'Uneven yield expected.',
      latestImageryDate: '2026-05-15',
      temporalInsightForecast: 'Temporal Insight & Forecast: stability expected near term.',
    });
    const parsed = parseSiAoiAgriculturalInterpretationJson(json);
    expect(parsed?.riskLevel).toBe('Medium');
    expect(parsed?.insights).toHaveLength(5);
    expect(parsed?.latestImageryDate).toBe('2026-05-15');
  });

  it('classifies temporal trend from veg change', () => {
    expect(classifySiAoiTemporalTrend(-8, minimalReport().timeSeries)).toBe('decline');
    expect(classifySiAoiTemporalTrend(0, minimalReport().timeSeries)).toBe('stability');
  });

  it('resolves latest imagery date from timeline tail', () => {
    expect(resolveLatestImageryDate(minimalReport())).toBe('2026-05-15');
  });

  it('adds crop-specific disease insight when AOI name includes crop', () => {
    const report = { ...minimalReport(), aoiName: 'Wheat parcel north' };
    const ag = buildSiAoiAgriculturalInterpretation(report, report.dataInsights);
    expect(ag.insights[4]).toMatch(/Wheat/i);
    expect(ag.temporalInsightForecast).toMatch(/Crop-specific note/i);
    expect(ag.temporalInsightForecast).toMatch(/Live Index/i);
  });

  it('scores high risk when stress area is large', () => {
    const m = buildSiAoiInterpretationMetrics(minimalReport(), minimalReport().dataInsights);
    const highStress = { ...m, stressedAreaPct: 40, ndviMean: 0.18, heatRiskLabel: 'High' };
    expect(computeSiAoiRiskLevel(highStress)).toBe('High');
  });
});
