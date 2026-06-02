import { describe, expect, it } from 'vitest';
import {
  buildFallbackReportExecutiveSummary,
  buildFallbackReportInterpretation,
  buildSiAoiReportActiveLayersContext,
  inferDefaultSiAoiReportType,
  siAoiReportTypeInterpretationSectionTitle,
  siAoiReportTypeLabel,
} from './siAoiReportType';
import type { SiAoiReportModel } from './siAoiVegetationReportModel';

function minimalReport(overrides: Partial<SiAoiReportModel> = {}): SiAoiReportModel {
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
      ],
      dashboard: {
        vegChangePct: -8,
        heatRiskLabel: 'Moderate',
        barSeries: [],
        pieSlices: [],
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
    ...overrides,
  };
}

describe('siAoiReportType', () => {
  it('infers infrastructure from layer labels', () => {
    expect(
      inferDefaultSiAoiReportType({ layerLabels: ['Road network', 'Bridges'], indexId: 'NDVI' }),
    ).toBe('INFRASTRUCTURE');
  });

  it('builds active layers context from WMS and custom layers', () => {
    const ctx = buildSiAoiReportActiveLayersContext({
      primaryIndexId: 'NDVI',
      primaryIndexLabel: 'NDVI',
      wmsLayerId: 'SENTINEL_NDVI',
      wmsLayerLabel: 'Sentinel NDVI',
      customLayers: [{ id: 'roads', name: 'Roads', visible: true, renderMode: 'vector' }],
    });
    expect(ctx.layers).toHaveLength(2);
    expect(ctx.layers[1]?.kind).toBe('vector');
  });

  it('produces different fallback summaries per report type', () => {
    const ag = buildFallbackReportExecutiveSummary(minimalReport({ reportType: 'AGRICULTURE' }));
    const urban = buildFallbackReportExecutiveSummary(
      minimalReport({ reportType: 'URBAN_PLANNING', aoiName: 'District 4' }),
    );
    expect(ag).toContain('ha');
    expect(urban.toLowerCase()).toContain('urban');
    expect(urban).not.toBe(ag);
  });

  it('builds typed interpretation with domain section titles', () => {
    const infra = buildFallbackReportInterpretation(minimalReport({ reportType: 'INFRASTRUCTURE' }));
    expect(infra.insights).toHaveLength(5);
    expect(infra.recommendations).toHaveLength(3);
    expect(siAoiReportTypeInterpretationSectionTitle('INFRASTRUCTURE')).toContain('Infrastructure');
    expect(siAoiReportTypeLabel('WATER_RESOURCES')).toBe('Water Resources Report');
  });
});
