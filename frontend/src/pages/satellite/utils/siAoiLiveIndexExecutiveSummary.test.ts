import { describe, expect, it } from 'vitest';
import {
  buildAgExecutiveSummaryFiveLines,
  buildFallbackLiveIndexExecutiveSummary,
  buildLiveIndexExecutiveContext,
  clampLiveIndexExecutiveSummary,
} from './siAoiLiveIndexExecutiveSummary';
import type { SiAoiReportModel } from './siAoiVegetationReportModel';

function mockReport(overrides: Partial<SiAoiReportModel> = {}): SiAoiReportModel {
  return {
    indexId: 'NDVI',
    indexLabel: 'NDVI',
    aoiName: 'Drawn AOI 1',
    dateStart: '2026-03-08',
    dateEnd: '2026-05-31',
    aoiAreaKm2: 16.879,
    summaryLinesEn: [],
    analysisEn: '',
    stressNoteEn: null,
    timeSeries: [{ date: '2026-03-08', value: -0.2 }],
    heatmapCellsGeoJson: { type: 'FeatureCollection', features: [] },
    aoiOutlineGeoJson: { type: 'FeatureCollection', features: [] },
    changeDetectionSlots: [],
    tableRows: [
      { key: 'a', labelEn: '-0.5 – -0.2', pct: 35.3, areaKm2: 5.96 },
      { key: 'b', labelEn: '0.6 – 1', pct: 47.1, areaKm2: 7.94 },
      { key: 'c', labelEn: '0.25 – 0.3', pct: 5.9, areaKm2: 0.99 },
    ],
    dataInsights: {
      indexRows: [{ indexId: 'NDVI', label: 'NDVI', min: -0.5, max: 0.8, mean: 0.055, std: 0.2, status: 'Moderate' }],
      dashboard: { vegChangePct: 0, heatRiskLabel: 'Low', barSeries: [], pieSlices: [] },
      executiveSummaryAi: null,
    },
    classificationPalette: { high: '#166534', medium: '#ca8a04', low: '#78716c', aoiOutline: '#334155' },
    legendBandCount: 5,
    reportStyleMode: 'SCIENTIFIC',
    ...overrides,
  } as SiAoiReportModel;
}

describe('siAoiLiveIndexExecutiveSummary', () => {
  it('builds context with health shares from legend bands', () => {
    const ctx = buildLiveIndexExecutiveContext(mockReport());
    expect(ctx.healthyPct + ctx.moderatePct + ctx.stressPct + ctx.bareSoilPct).toBeGreaterThan(50);
    expect(ctx.ndviMean).toBeCloseTo(0.055, 2);
  });

  it('produces exactly five agronomist lines without GIS jargon', () => {
    const lines = buildAgExecutiveSummaryFiveLines(mockReport());
    expect(lines).toHaveLength(5);
    const text = lines.join(' ');
    expect(text.toLowerCase()).not.toMatch(/epsg|wms|crs|composite/);
    expect(text).toMatch(/NDVI/i);
    expect(text).toMatch(/yield potential/i);
    expect(text).toMatch(/Temporal analysis/i);
    expect(lines[0]).toMatch(/ha\)/i);
    expect(lines[1]).toMatch(/healthy/i);
    expect(lines[2]).toMatch(/Environmental conditions/i);
  });

  it('does not triple hectare annotations in fallback', () => {
    const lines = buildAgExecutiveSummaryFiveLines(mockReport());
    const joined = lines.join(' ');
    expect(joined).not.toMatch(/\(.*ha\)\s*\(.*ha\)\s*\(.*ha\)/i);
  });

  it('strips GIS terms from Gemini output', () => {
    const raw =
      'Sentinel Hub EPSG:4326 WMS composite. The AOI shows moderate crop condition with NDVI 0.12. Yield potential is moderate.';
    const out = clampLiveIndexExecutiveSummary(raw);
    expect(out.toLowerCase()).not.toMatch(/epsg|wms|composite/);
    expect(out).toMatch(/NDVI|crop condition/i);
  });
});
