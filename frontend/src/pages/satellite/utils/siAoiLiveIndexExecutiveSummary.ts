/**
 * Live Index executive summary — agronomist-facing, exactly five lines.
 * Built from AOI area, class shares, NDVI / NDMI / NDWI / LST, trend, and recommendations.
 */
import { deriveEnvironmentalIndicators } from './liveAoiEnvironmentalIndicators';
import { buildAgHealthPieSlices, type AgHealthCategory } from './siCropGrowthStage';
import { liveAnalysisToZonalAnalytics } from './siAoiReportLiveAnalysisSnapshot';
import {
  applyAreaHaToPercentages,
  dedupeRepeatedHaAnnotations,
  formatHaValue,
  formatSharePctWithHa,
} from './siAoiReportAreaFormat';
import type { SiAoiReportModel } from './siAoiVegetationReportModel';

export type YieldPotentialLevel = 'Low' | 'Moderate' | 'High';

export type LiveIndexExecutiveContext = {
  aoiName: string;
  aoiAreaKm2: number;
  aoiAreaHa: number;
  period: string;
  analysisDate: string | null;
  activeLayerLabel: string;
  ndviMean: number | null;
  ndmiMean: number | null;
  ndwiMean: number | null;
  surfaceTempC: number | null;
  soilMoisturePct: number | null;
  waterPct: number | null;
  healthShares: Record<AgHealthCategory, number>;
  healthyPct: number;
  moderatePct: number;
  stressPct: number;
  bareSoilPct: number;
  weakOrBarePct: number;
  yieldPotential: YieldPotentialLevel;
  stressPresent: boolean;
  stressReasons: string[];
  dataSource: 'live_raster' | 'legend_bands';
};

export const LIVE_INDEX_EXECUTIVE_MAX_SENTENCES = 5;
export const LIVE_INDEX_EXECUTIVE_MIN_SENTENCES = 5;

function pctFromSlices(slices: ReturnType<typeof buildAgHealthPieSlices>, label: AgHealthCategory): number {
  return slices.find(s => s.label === label)?.pct ?? 0;
}

function computeYieldPotential(healthy: number, stress: number, bare: number): YieldPotentialLevel {
  const weak = stress + bare;
  if (healthy >= 45 && weak < 22) return 'High';
  if (healthy < 18 || weak >= 55) return 'Low';
  return 'Moderate';
}

function detectStressReasons(ctx: {
  stressPct: number;
  bareSoilPct: number;
  ndmiMean: number | null;
  surfaceTempC: number | null;
  soilMoisturePct: number | null;
  ndviMean: number | null;
}): string[] {
  const reasons: string[] = [];
  if (ctx.stressPct >= 12) reasons.push('stressed canopy zones');
  if (ctx.bareSoilPct >= 15) reasons.push('bare or uncultivated patches');
  if (ctx.ndviMean != null && ctx.ndviMean < 0.22) reasons.push('low green biomass');
  if (ctx.ndmiMean != null && ctx.ndmiMean < -0.06) reasons.push('low canopy moisture');
  if (ctx.soilMoisturePct != null && ctx.soilMoisturePct < 38) reasons.push('dry soil moisture signal');
  if (ctx.surfaceTempC != null && ctx.surfaceTempC >= 32) reasons.push('heat stress');
  return reasons;
}

export function buildLiveIndexExecutiveContext(report: SiAoiReportModel): LiveIndexExecutiveContext {
  const live = report.liveLayerAnalysis;
  const slices = buildAgHealthPieSlices(report);
  const healthyPct = pctFromSlices(slices, 'Healthy');
  const moderatePct = pctFromSlices(slices, 'Moderate');
  const stressPct = pctFromSlices(slices, 'Stress');
  const bareSoilPct = pctFromSlices(slices, 'Bare soil');

  const indexRows = report.dataInsights?.indexRows ?? [];
  const ndviRow = indexRows.find(r => r.indexId === 'NDVI');
  const lstRow = indexRows.find(r => r.indexId === 'LST');

  let ndviMean = live?.healthPrimaryMean ?? ndviRow?.mean ?? null;
  if (ndviMean == null && report.indexId === 'NDVI' && live?.classAnalytics?.mean != null) {
    ndviMean = live.classAnalytics.mean;
  }
  if (ndviMean == null && report.indexId === 'NDVI' && report.timeSeries.length) {
    ndviMean = report.timeSeries.reduce((a, t) => a + t.value, 0) / report.timeSeries.length;
  }

  const zonal = live ? liveAnalysisToZonalAnalytics(live) : null;
  const env = deriveEnvironmentalIndicators(zonal, lstRow?.mean ?? null);

  const stressReasons = detectStressReasons({
    stressPct,
    bareSoilPct,
    ndmiMean: env.ndmiMean,
    surfaceTempC: env.surfaceTempC,
    soilMoisturePct: env.moisturePct,
    ndviMean,
  });

  return {
    aoiName: report.aoiName,
    aoiAreaKm2: report.aoiAreaKm2,
    aoiAreaHa: report.aoiAreaKm2 * 100,
    period: `${report.dateStart} – ${report.dateEnd}`,
    analysisDate: live?.analysisDateIso ?? null,
    activeLayerLabel: live?.activeLayerLabel ?? report.indexLabel,
    ndviMean: ndviMean != null && Number.isFinite(ndviMean) ? ndviMean : null,
    ndmiMean: env.ndmiMean,
    ndwiMean: env.ndwiMean,
    surfaceTempC: env.surfaceTempC,
    soilMoisturePct: env.moisturePct,
    waterPct: env.humidityPct,
    healthShares: {
      Healthy: healthyPct,
      Moderate: moderatePct,
      Stress: stressPct,
      'Bare soil': bareSoilPct,
    },
    healthyPct,
    moderatePct,
    stressPct,
    bareSoilPct,
    weakOrBarePct: stressPct + bareSoilPct,
    yieldPotential: computeYieldPotential(healthyPct, stressPct, bareSoilPct),
    stressPresent: stressReasons.length > 0 || Boolean(report.stressNoteEn?.trim()),
    stressReasons,
    dataSource: live?.dataSource === 'raster' ? 'live_raster' : 'legend_bands',
  };
}

function yieldPotentialPhrase(level: YieldPotentialLevel): string {
  if (level === 'High') return 'high yield potential';
  if (level === 'Low') return 'low yield potential';
  return 'moderate yield potential';
}

function cropConditionAdjective(level: YieldPotentialLevel): string {
  if (level === 'High') return 'favourable';
  if (level === 'Low') return 'poor';
  return 'moderate';
}

function ndviBiomassPhrase(ndviMean: number | null): string {
  if (ndviMean == null) return 'reflecting mixed canopy vigor from satellite layers';
  if (ndviMean < 0.15) return 'indicating overall vegetation stress and low biomass';
  if (ndviMean < 0.35) return 'indicating moderate green biomass with stressed zones';
  return 'indicating active canopy development';
}

function monthLabelFromIso(dateIso: string): string {
  const m = Number.parseInt(dateIso.slice(5, 7), 10);
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  if (!Number.isFinite(m) || m < 1 || m > 12) return dateIso.slice(0, 10);
  return names[m - 1];
}

function describeVegetationTrend(report: SiAoiReportModel): string {
  const label = report.indexId === 'NDVI' ? 'NDVI' : report.indexLabel;
  const ts = report.timeSeries.filter(t => Number.isFinite(t.value));
  if (ts.length < 3) {
    return `Temporal analysis is limited for this period — extend the date range to confirm ${label} trend direction.`;
  }

  let peakIdx = 0;
  let peakVal = ts[0].value;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i].value > peakVal) {
      peakVal = ts[i].value;
      peakIdx = i;
    }
  }

  const first = ts[0].value;
  const last = ts[ts.length - 1].value;
  const delta = last - first;
  const declinedAfterPeak = peakIdx < ts.length - 1 && last < peakVal - 0.03;
  const peakMonth = monthLabelFromIso(ts[peakIdx].date);

  if (declinedAfterPeak || delta < -0.03) {
    return `Temporal analysis shows a declining ${label} trend after peaking in ${peakMonth}, confirming a reduction in vegetation activity.`;
  }
  if (delta > 0.03) {
    return `Temporal analysis shows an increasing ${label} trend through the monitoring period, indicating strengthening vegetation activity.`;
  }
  return `Temporal analysis shows a relatively stable ${label} pattern across the monitoring period.`;
}

function describeHeatStress(surfaceTempC: number | null): string {
  if (surfaceTempC == null) return 'field temperature data was limited';
  if (surfaceTempC >= 34) return `high heat stress (${surfaceTempC.toFixed(1)}°C)`;
  if (surfaceTempC >= 30) return `moderate heat stress (${surfaceTempC.toFixed(1)}°C)`;
  if (surfaceTempC >= 26) return `mild heat exposure (${surfaceTempC.toFixed(1)}°C)`;
  return `low heat stress (${surfaceTempC.toFixed(1)}°C)`;
}

function describeSurfaceMoisture(ctx: LiveIndexExecutiveContext): string {
  const parts: string[] = [];
  if (ctx.ndwiMean != null) {
    const level =
      ctx.ndwiMean < -0.05 ? 'low surface moisture' : ctx.ndwiMean > 0.1 ? 'good surface moisture' : 'moderate surface moisture';
    parts.push(`${level} (NDWI ${ctx.ndwiMean.toFixed(3)})`);
  }
  if (ctx.ndmiMean != null) {
    const level =
      ctx.ndmiMean < -0.06
        ? 'low canopy moisture'
        : ctx.ndmiMean > 0.1
          ? 'adequate canopy moisture'
          : 'moderate canopy moisture';
    parts.push(`${level} (NDMI ${ctx.ndmiMean.toFixed(3)}${ctx.soilMoisturePct != null ? `, soil proxy ${ctx.soilMoisturePct.toFixed(0)}%` : ''})`);
  }
  if (!parts.length) return 'moisture indices were limited for this export';
  return parts.join(' and ');
}

function waterAvailabilityHint(ctx: LiveIndexExecutiveContext): string {
  const dry =
    (ctx.ndwiMean != null && ctx.ndwiMean < -0.05) ||
    (ctx.ndmiMean != null && ctx.ndmiMean < -0.06) ||
    (ctx.soilMoisturePct != null && ctx.soilMoisturePct < 38);
  if (dry) return 'limited water availability';
  if (ctx.ndwiMean != null && ctx.ndwiMean > 0.08) return 'adequate surface water for current growth stage';
  return 'variable water availability across the AOI';
}

function buildLandCoverLine(ctx: LiveIndexExecutiveContext): string {
  const ha = (pct: number) => formatSharePctWithHa(pct, ctx.aoiAreaKm2);
  const healthy = ha(ctx.healthyPct);
  const bare = ha(ctx.bareSoilPct);

  if (ctx.bareSoilPct >= 15 && ctx.healthyPct >= 20) {
    const moderateBit =
      ctx.moderatePct >= 1 ? `, ${ha(ctx.moderatePct)} moderate vegetation` : '';
    return `Land cover is uneven, with ${healthy} healthy vegetation${moderateBit} but a significant ${bare} bare soil, reflecting weak crop establishment in several areas.`;
  }
  if (ctx.bareSoilPct >= 15) {
    return `Land cover is dominated by ${bare} bare soil with only ${healthy} healthy vegetation, indicating poor establishment across much of the AOI.`;
  }
  const stress = ha(ctx.stressPct);
  return `Crop health distribution shows ${healthy} healthy canopy, ${ha(ctx.moderatePct)} moderate vigor, and ${stress} stressed vegetation across the AOI.`;
}

function buildRecommendationLine(ctx: LiveIndexExecutiveContext): string {
  const yp = yieldPotentialPhrase(ctx.yieldPotential);
  if (ctx.bareSoilPct >= 20 || ctx.yieldPotential === 'Low') {
    return `Overall, the area reflects ${yp} with clear stressed zones, requiring targeted field monitoring and soil investigation in bare patches.`;
  }
  if (ctx.yieldPotential === 'High') {
    return `Overall, the area reflects ${yp}; maintain inputs on productive zones and monitor moderate parcels before the next growth window.`;
  }
  return `Overall, the area reflects ${yp} with identifiable stressed zones, requiring targeted field monitoring and irrigation checks where moisture is low.`;
}

/** Five print-ready executive summary lines for agriculture PDF / UI. */
export function buildAgExecutiveSummaryFiveLines(report: SiAoiReportModel): string[] {
  const ctx = buildLiveIndexExecutiveContext(report);
  const areaHa = formatHaValue(ctx.aoiAreaHa);
  const ndviPart =
    ctx.ndviMean != null ? `an average NDVI of ${ctx.ndviMean.toFixed(3)}` : 'satellite vegetation indices';

  const line1 = `The AOI (${areaHa}) shows a ${cropConditionAdjective(ctx.yieldPotential)} crop condition with ${ndviPart}, ${ndviBiomassPhrase(ctx.ndviMean)}.`;
  const line2 = buildLandCoverLine(ctx);
  const line3 = `Environmental conditions indicate ${describeHeatStress(ctx.surfaceTempC)} and ${describeSurfaceMoisture(ctx)}, suggesting ${waterAvailabilityHint(ctx)}.`;
  const line4 = describeVegetationTrend(report);
  const line5 = buildRecommendationLine(ctx);

  return [line1, line2, line3, line4, line5];
}

/** Clamp Gemini or legacy text to exactly five sentences, strip GIS jargon fragments. */
export function clampLiveIndexExecutiveSummary(raw: string): string {
  let s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';

  s = s
    .replace(/\b(EPSG:\d+|WGS84|CRS|WMS|raster|zonal stats?|client-side demo|MAXCC|composite|symbology)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = s
    .split(/(?<=[.!?])\s+/)
    .map(x => x.trim())
    .filter(x => x.length > 12);

  if (!sentences.length) return s.slice(0, 680);
  return sentences.slice(0, LIVE_INDEX_EXECUTIVE_MAX_SENTENCES).join(' ');
}

/** Client-side executive summary when Gemini is unavailable. */
export function buildFallbackLiveIndexExecutiveSummary(report: SiAoiReportModel): string {
  return buildAgExecutiveSummaryFiveLines(report).join(' ');
}

/** Ensure executive prose cites hectares beside area shares. */
export function enrichExecutiveSummaryAreaHa(text: string, report: SiAoiReportModel): string {
  return dedupeRepeatedHaAnnotations(applyAreaHaToPercentages(text, report.aoiAreaKm2));
}

export const LIVE_INDEX_EXECUTIVE_GEMINI_CONFIG = {
  task: 'Write an executive summary for an agricultural AOI intelligence report based on Live Index layers.',
  rules: [
    'Output plain English only — no markdown, bullets, JSON, or line breaks.',
    'Exactly 5 complete sentences in this order: (1) AOI total area in ha, crop condition, mean NDVI, biomass/stress reading; (2) land-cover shares with % and ha for healthy, moderate, and bare/stressed; (3) field temperature °C and moisture (NDWI and NDMI values); (4) temporal NDVI trend from timelineChart; (5) overall yield potential and field recommendation.',
    'Audience: agricultural engineer — not a GIS analyst.',
    'Use ONLY facts from liveIndexContext, aoiAreaHa, and timelineChart in the payload.',
    'When citing area shares, add hectares once after each percentage, e.g. "52.9% (43.7 ha)" — never repeat the same ha annotation.',
    'Sentence 1 must state AOI area (ha), crop condition (favourable/moderate/poor), mean NDVI, and vegetation stress or biomass.',
    'Sentence 3 must include LST °C when present and NDWI/NDMI with numeric values.',
    'Sentence 4 must describe whether NDVI increased, declined, or was stable across the period.',
    'Sentence 5 must state yield potential (Low/Moderate/High) and a practical recommendation (monitoring, soil sampling, or irrigation).',
    'Never mention CRS, EPSG, WMS, raster topology, zonal statistics, composites, or cloud screening.',
  ],
  systemInstruction:
    'You are a senior agricultural engineer advising decision makers. Write concise, confident five-sentence executive summaries from satellite live index class distributions.',
  maxChars: 1100,
} as const;
