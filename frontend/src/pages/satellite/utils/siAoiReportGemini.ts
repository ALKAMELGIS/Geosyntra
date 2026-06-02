import { geminiGenerateContent, type GeminiContent } from '../../../lib/geoExplorerGemini';
import {
  buildSiAoiInterpretationMetrics,
  enrichSiAoiAgriculturalInterpretation,
  inferCropFromAoiName,
  parseSiAoiAgriculturalInterpretationJson,
  resolveLatestImageryDate,
  type SiAoiAgriculturalInterpretation,
} from './siAoiAgriculturalInterpretation';
import {
  buildLiveIndexExecutiveContext,
  clampLiveIndexExecutiveSummary,
  enrichExecutiveSummaryAreaHa,
  LIVE_INDEX_EXECUTIVE_GEMINI_CONFIG,
} from './siAoiLiveIndexExecutiveSummary';
import type { SiAoiDataInsightsBundle, SiAoiReportModel } from './siAoiVegetationReportModel';
import {
  buildReportLayersPayload,
  siAoiReportTypeGeminiConfig,
  siAoiReportTypeLabel,
} from './siAoiReportType';
import {
  DEFAULT_SI_AOI_REPORT_STYLE_MODE,
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
  const liveIndexContext = buildLiveIndexExecutiveContext(report);
  const inferredCropFromAoiName = inferCropFromAoiName(report.aoiName);

  return {
    aoi: report.aoiName,
    inferredCropFromAoiName,
    period: `${report.dateStart} .. ${report.dateEnd}`,
    primaryIndex: report.indexLabel,
    aoiAreaKm2: report.aoiAreaKm2,
    aoiAreaHa: report.aoiAreaKm2 * 100,
    liveIndexContext,
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
      sharePct: r.pct,
      areaKm2: r.areaKm2,
    })),
    dashboard: {
      vegChangePct: insights.dashboard.vegChangePct,
      heatRiskLabel: insights.dashboard.heatRiskLabel,
    },
    timelineChart: {
      indexLabel: report.indexLabel,
      points: report.timeSeries.map(t => ({ date: t.date.slice(0, 10), value: t.value })),
      sparkNdvi: insights.dashboard.sparkNdvi,
    },
    latestImageryDate: resolveLatestImageryDate(report),
    liveIndexLayer: report.liveLayerAnalysis?.activeLayerLabel ?? report.indexLabel,
    stressFlag: Boolean(report.stressNoteEn?.trim()),
    ...buildReportLayersPayload(report),
  };
}

/**
 * Agricultural executive summary from Live Index class distribution (English, 3–5 sentences).
 */
export async function fetchSiAoiReportExecutiveSummaryFromGemini(opts: {
  apiKey: string;
  report: SiAoiReportModel;
  insights: SiAoiDataInsightsBundle;
  styleMode?: SiAoiReportStyleMode;
}): Promise<string | null> {
  const key = opts.apiKey.trim();
  if (!key) return null;

  const typeCfg = siAoiReportTypeGeminiConfig(opts.report.reportType);
  const liveIndexContext = buildLiveIndexExecutiveContext(opts.report);
  const context = buildGeminiContextPayload(opts.report, opts.insights);
  const styleMode = opts.styleMode ?? opts.report.reportStyleMode ?? DEFAULT_SI_AOI_REPORT_STYLE_MODE;

  const executiveRules = [
    ...typeCfg.executiveRules,
    'Write exactly five complete sentences as one executive summary block.',
    'Never reuse the same narrative across report types — tailor every sentence to reportType, activeLayers, and AOI statistics.',
    'When citing area shares as percentages, always add hectares in parentheses using aoiAreaHa.',
    ...(opts.report.reportType === 'AGRICULTURE' ? LIVE_INDEX_EXECUTIVE_GEMINI_CONFIG.rules : []),
  ];

  const payload = {
    reportType: opts.report.reportType,
    reportTypeLabel: siAoiReportTypeLabel(opts.report.reportType),
    styleMode,
    task: typeCfg.executiveTask,
    rules: executiveRules,
    focusTopics: typeCfg.focusTopics,
    liveIndexContext,
    ...context,
  };

  const systemInstruction =
    opts.report.reportType === 'AGRICULTURE'
      ? `${typeCfg.executiveSystem} ${LIVE_INDEX_EXECUTIVE_GEMINI_CONFIG.systemInstruction}`
      : typeCfg.executiveSystem;

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }];

  try {
    const text = await geminiGenerateContent({
      apiKey: key,
      systemInstruction,
      contents,
    });
    const t = clampLiveIndexExecutiveSummary(
      text
        .trim()
        .replace(/^[\s`*#\-•]+/gm, '')
        .replace(/\r\n/g, ' ')
        .replace(/\n{2,}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, LIVE_INDEX_EXECUTIVE_GEMINI_CONFIG.maxChars),
    );
    const enriched = t ? enrichExecutiveSummaryAreaHa(t, opts.report) : '';
    return enriched || null;
  } catch {
    return null;
  }
}

const AGRONOMIST_INTERPRETATION_SYSTEM = `You are an agricultural engineer advising farm managers. Translate satellite indicators into yield-focused field intelligence. Never use GIS jargon (CRS, WMS, zonal stats, raster topology). Include numeric index values from the payload when stating conclusions. Output valid JSON only.`;

function interpretationOutputSchema(reportType: SiAoiReportModel['reportType']) {
  const domain =
    reportType === 'AGRICULTURE'
      ? 'crop'
      : siAoiReportTypeLabel(reportType).replace(/ Report$/i, '').toLowerCase();
  return {
    insights: `array of exactly 5 short strings — domain-specific reading of class distribution (% + ha), index means, active layers, and temporal trend for ${domain}`,
    recommendations: `array of exactly 3 short actionable strings appropriate for a ${domain} report (not generic GIS advice)`,
    riskLevel: 'Low | Medium | High — single overall conclusion for this report type',
    riskCause: 'one short phrase if risk is Medium or High; null if Low',
    cropCondition: `one sentence ${domain} condition summary from indices and class shares inside the AOI`,
    yieldImpact: `one sentence linking stressed vs favourable hectares to expected ${domain} impact`,
    latestImageryDate: 'YYYY-MM-DD — latest timeline / Live Index scene date from payload',
    temporalInsightForecast:
      'one sentence: Temporal Insight & Forecast — trend (improvement | stability | decline) from timelineChart + Live Index; near-term outlook for this report type',
  };
}

/**
 * Yield Insight interpretation for agronomists (5 insights + 3 recommendations + risk).
 */
export async function fetchSiAoiAgriculturalInterpretationFromGemini(opts: {
  apiKey: string;
  report: SiAoiReportModel;
  insights: SiAoiDataInsightsBundle;
}): Promise<SiAoiAgriculturalInterpretation | null> {
  const key = opts.apiKey.trim();
  if (!key) return null;

  const typeCfg = siAoiReportTypeGeminiConfig(opts.report.reportType);
  const metrics = buildSiAoiInterpretationMetrics(opts.report, opts.insights);
  const context = buildGeminiContextPayload(opts.report, opts.insights);

  const interpretationRules = [
    'Return JSON only — no markdown fences.',
    'Exactly 5 insight strings and 3 recommendation strings; no numbering inside strings.',
    'Analyze active layer names, raster/vector kinds, indexStatistics, classDistribution, and metrics before writing.',
    'When stating area shares as percentages, always add hectares in parentheses using metrics.aoiAreaKm2.',
    'Do not invent data not present in metrics, classDistribution, or activeLayers.',
    'Tailor language and recommendations strictly to reportType — never use crop irrigation advice for infrastructure or urban reports.',
    ...typeCfg.interpretationRules,
    ...(opts.report.reportType === 'AGRICULTURE'
      ? [
          'Plain agricultural language; cite NDVI, NDMI (soil moisture), NDWI (water), LST °C when available.',
          'When inferredCropFromAoiName is non-null, name likely disease types driven by Live Index NDVI/NDMI plus temperature/soil moisture.',
        ]
      : []),
  ];

  const payload = {
    reportType: opts.report.reportType,
    reportTypeLabel: siAoiReportTypeLabel(opts.report.reportType),
    task: typeCfg.interpretationTask,
    outputSchema: interpretationOutputSchema(opts.report.reportType),
    rules: interpretationRules,
    focusTopics: typeCfg.focusTopics,
    metrics,
    ...context,
  };

  const systemInstruction =
    opts.report.reportType === 'AGRICULTURE'
      ? AGRONOMIST_INTERPRETATION_SYSTEM
      : `${typeCfg.interpretationSystem} Never use GIS jargon (CRS, WMS, zonal stats). Include numeric values from the payload. Output valid JSON only.`;

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }];

  try {
    const text = await geminiGenerateContent({
      apiKey: key,
      systemInstruction,
      contents,
    });
    const parsed = parseSiAoiAgriculturalInterpretationJson(text);
    if (parsed?.insights.length >= 5 && parsed.recommendations.length >= 3) {
      return enrichSiAoiAgriculturalInterpretation(opts.report, opts.insights, parsed);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Numbered interpretation bullets for the AOI PDF (tone varies by style mode).
 * @deprecated Prefer fetchSiAoiAgriculturalInterpretationFromGemini for Yield Insight exports.
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
