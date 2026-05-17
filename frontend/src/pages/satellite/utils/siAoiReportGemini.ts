import { geminiGenerateContent, type GeminiContent } from '../../../lib/geoExplorerGemini';
import type { SiAoiDataInsightsBundle, SiAoiReportModel } from './siAoiVegetationReportModel';
import {
  DEFAULT_SI_AOI_REPORT_STYLE_MODE,
  siAoiReportStyleModeExecutiveConfig,
  siAoiReportStyleModeInterpretationConfig,
  type SiAoiReportStyleMode,
} from './siAoiReportStyleMode';

function parseNumberedPoints(text: string, max: number): string[] {
  const lines = text
    .split(/\n+/)
    .map(l => l.replace(/^\s*[\d]+[.)]\s*/, '').trim())
    .filter(Boolean);
  if (lines.length >= Math.min(3, max)) return lines.slice(0, max);
  const chunks = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 24);
  return chunks.slice(0, max);
}

function buildGeminiContextPayload(report: SiAoiReportModel, insights: SiAoiDataInsightsBundle) {
  const pc = report.processingContext;
  const periodMean =
    report.timeSeries.length > 0
      ? report.timeSeries.reduce((a, t) => a + t.value, 0) / report.timeSeries.length
      : null;

  return {
    aoi: report.aoiName,
    period: `${report.dateStart} .. ${report.dateEnd}`,
    primaryIndex: report.indexLabel,
    satelliteProvider: report.satelliteProviderName ?? null,
    aoiAreaKm2: report.aoiAreaKm2,
    legendBandCount: report.legendBandCount,
    periodMean,
    demoClientSide: report.summaryLinesEn.some(l => /client-side demo|zonal-stats service/i.test(l)),
    processing: pc
      ? {
          cloudCoverMaxPct: pc.cloudCoverMaxPct,
          temporalComposite: pc.temporalComposite,
          crs: pc.crsNote ?? 'EPSG:4326 (WGS84)',
        }
      : null,
    indexStatistics: insights.indexRows.map(r => ({
      index: r.label,
      min: r.min,
      max: r.max,
      mean: r.mean,
      std: r.std,
      status: r.status,
    })),
    classDistribution: report.tableRows.map((r, i) => ({
      classNo: i + 1,
      indexRange: r.labelEn,
      areaKm2: r.areaKm2,
      sharePct: r.pct,
    })),
    dashboard: insights.dashboard,
    stressFlag: report.stressNoteEn,
    baselineSummary: report.summaryLinesEn.join(' '),
  };
}

/**
 * Executive / scientific narrative for AOI remote-sensing report (English, plain text).
 * Tone and length follow `styleMode` (SCIENTIFIC | EXECUTIVE | SUMMARY | TECHNICAL).
 */
export async function fetchSiAoiReportExecutiveSummaryFromGemini(opts: {
  apiKey: string;
  report: SiAoiReportModel;
  insights: SiAoiDataInsightsBundle;
  styleMode?: SiAoiReportStyleMode;
}): Promise<string | null> {
  const key = opts.apiKey.trim();
  if (!key) return null;

  const styleMode = opts.styleMode ?? opts.report.reportStyleMode ?? DEFAULT_SI_AOI_REPORT_STYLE_MODE;
  const cfg = siAoiReportStyleModeExecutiveConfig(styleMode);
  const context = buildGeminiContextPayload(opts.report, opts.insights);

  const payload = {
    styleMode,
    task: cfg.task,
    rules: cfg.rules,
    ...context,
  };

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }];

  try {
    const text = await geminiGenerateContent({
      apiKey: key,
      systemInstruction: cfg.systemInstruction,
      contents,
    });
    const t = text.trim().replace(/^[\s`*#-]+/gm, '').slice(0, cfg.maxChars);
    return t || null;
  } catch {
    return null;
  }
}

/**
 * Numbered interpretation bullets for the AOI PDF (tone varies by style mode).
 */
export async function fetchSiAoiReportInterpretationFromGemini(opts: {
  apiKey: string;
  report: SiAoiReportModel;
  insights: SiAoiDataInsightsBundle;
  styleMode?: SiAoiReportStyleMode;
}): Promise<string[] | null> {
  const key = opts.apiKey.trim();
  if (!key) return null;

  const styleMode = opts.styleMode ?? opts.report.reportStyleMode ?? DEFAULT_SI_AOI_REPORT_STYLE_MODE;
  const cfg = siAoiReportStyleModeInterpretationConfig(styleMode);
  const context = buildGeminiContextPayload(opts.report, opts.insights);

  const payload = {
    styleMode,
    task: cfg.task,
    rules: cfg.rules,
    ...context,
    vegetationChangePct: opts.insights.dashboard.vegChangePct,
    heatRisk: opts.insights.dashboard.heatRiskLabel,
  };

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }];

  try {
    const text = await geminiGenerateContent({
      apiKey: key,
      systemInstruction: cfg.systemInstruction,
      contents,
    });
    const points = parseNumberedPoints(text.trim(), cfg.pointCount);
    const minPoints = styleMode === 'SUMMARY' ? 2 : 3;
    return points.length >= minPoints ? points.slice(0, cfg.pointCount) : null;
  } catch {
    return null;
  }
}
