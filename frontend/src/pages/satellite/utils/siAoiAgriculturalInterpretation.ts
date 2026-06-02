import type { SiAoiDataInsightsBundle, SiAoiReportModel } from './siAoiVegetationReportModel';
import { spectralContextFromReport, stageForReportTableRow } from './siCropGrowthStage';
import { deriveEnvironmentalIndicators } from './liveAoiEnvironmentalIndicators';
import { applyAreaHaToPercentages, formatSharePctWithHa } from './siAoiReportAreaFormat';
import type { SiAoiZonalAnalytics } from './siAoiZonalStats';
import {
  appendCropDiseaseToTemporalForecast,
  buildCropDiseaseForecast,
  inferCropFromAoiName,
  type SiAoiCropDiseaseContext,
  type SiAoiInferredCrop,
} from './siAoiCropNameInference';

export type SiAoiRiskLevel = 'Low' | 'Medium' | 'High';

export const SI_AOI_INTERPRETATION_INSIGHT_COUNT = 5;
export const SI_AOI_INTERPRETATION_RECOMMENDATION_COUNT = 3;

export type SiAoiTemporalTrend = 'improvement' | 'stability' | 'decline';

export type SiAoiAgriculturalInterpretation = {
  insights: string[];
  recommendations: string[];
  riskLevel: SiAoiRiskLevel;
  riskCause: string | null;
  cropCondition: string;
  yieldImpact: string;
  /** YYYY-MM-DD — latest scene used for current-condition baseline. */
  latestImageryDate: string;
  /** NDVI / stage / Live Index trend + near-term forecast (timeline + live layers). */
  temporalInsightForecast: string;
};

export type SiAoiInterpretationMetrics = {
  aoiName: string;
  aoiAreaKm2: number;
  period: string;
  indexLabel: string;
  ndviMean: number | null;
  ndmiMean: number | null;
  ndwiMean: number | null;
  lstMeanC: number | null;
  soilMoisturePct: number | null;
  waterPct: number | null;
  healthyAreaPct: number;
  stressedAreaPct: number;
  moderateAreaPct: number;
  dominantClass: string;
  dominantPct: number;
  secondClass: string | null;
  secondPct: number | null;
  vegChangePct: number;
  heatRiskLabel: string;
  stressFlag: boolean;
  /** Set only when the AOI name contains a crop keyword. */
  inferredCrop: SiAoiInferredCrop | null;
};

function safeText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtIndex(id: string, v: number): string {
  return id === 'LST' ? v.toFixed(1) : v.toFixed(2);
}

function isoDateOnly(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

/** Latest analysis scene date — Live Index snapshot, timeline tail, or report end. */
export function resolveLatestImageryDate(report: SiAoiReportModel): string {
  const live = isoDateOnly(report.liveLayerAnalysis?.analysisDateIso);
  if (live) return live;
  const ts = [...report.timeSeries].sort((a, b) => a.date.localeCompare(b.date));
  const tail = ts.length ? isoDateOnly(ts[ts.length - 1]!.date) : null;
  if (tail) return tail;
  return isoDateOnly(report.dateEnd) ?? report.dateEnd.slice(0, 10);
}

export function classifySiAoiTemporalTrend(
  vegChangePct: number,
  timeSeries: SiAoiReportModel['timeSeries'],
): SiAoiTemporalTrend {
  if (vegChangePct >= 5) return 'improvement';
  if (vegChangePct <= -5) return 'decline';
  const sorted = [...timeSeries].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length >= 2) {
    const delta = sorted[sorted.length - 1]!.value - sorted[0]!.value;
    if (delta >= 0.05) return 'improvement';
    if (delta <= -0.05) return 'decline';
  }
  return 'stability';
}

function temporalTrendPhrase(trend: SiAoiTemporalTrend): string {
  if (trend === 'improvement') return 'improvement';
  if (trend === 'decline') return 'decline';
  return 'stability';
}

export function formatLatestImageryDateLine(isoDate: string): string {
  const iso = isoDateOnly(isoDate) ?? isoDate.slice(0, 10);
  return `Latest Imagery Date: ${iso} — latest scene in the analysis adopted as the current-condition baseline.`;
}

export function buildLatestImageryDateLine(report: SiAoiReportModel, date?: string | null): string {
  return formatLatestImageryDateLine(isoDateOnly(date) ?? resolveLatestImageryDate(report));
}

function cropDiseaseContextFromMetrics(
  report: SiAoiReportModel,
  metrics: SiAoiInterpretationMetrics,
): SiAoiCropDiseaseContext {
  return {
    ndviMean: metrics.ndviMean,
    ndmiMean: metrics.ndmiMean,
    lstMeanC: metrics.lstMeanC,
    soilMoisturePct: metrics.soilMoisturePct,
    heatRiskLabel: metrics.heatRiskLabel,
    stressedAreaPct: metrics.stressedAreaPct,
    liveLayerLabel: report.liveLayerAnalysis?.activeLayerLabel ?? report.indexLabel,
  };
}

export { inferCropFromAoiName, buildCropDiseaseForecast } from './siAoiCropNameInference';

/** Client-side temporal + forecast line from timeline chart, Live Index, and NDVI/NDMI context. */
export function buildTemporalInsightForecast(
  report: SiAoiReportModel,
  metrics: SiAoiInterpretationMetrics,
): string {
  const trend = classifySiAoiTemporalTrend(metrics.vegChangePct, report.timeSeries);
  const trendLabel = temporalTrendPhrase(trend);
  const liveLabel = report.liveLayerAnalysis?.activeLayerLabel ?? report.indexLabel;
  const stage = metrics.dominantClass;

  const riskHints: string[] = [];
  if (metrics.stressedAreaPct >= 8) riskHints.push('disease exposure in stressed patches');
  if (metrics.ndviMean != null && metrics.ndviMean < 0.25) riskHints.push('low green biomass (NDVI)');
  if (metrics.ndmiMean != null && metrics.ndmiMean < -0.06) riskHints.push('canopy moisture deficit (NDMI)');
  if (metrics.soilMoisturePct != null && metrics.soilMoisturePct < 35) riskHints.push('dry soil moisture proxy');
  if (metrics.heatRiskLabel !== 'Low') riskHints.push('thermal stress');

  let line = `Temporal Insight & Forecast: based on ${report.indexLabel} / ${stage} stage / ${liveLabel} Live Index, the general crop trend shows ${trendLabel}`;
  line += ', with the near-term pattern likely to continue unless field conditions change.';
  if (riskHints.length) {
    line += ` AOI timeline signals suggest monitoring for ${riskHints.slice(0, 3).join(', ')}.`;
  }

  return appendCropDiseaseToTemporalForecast(line, report.aoiName, cropDiseaseContextFromMetrics(report, metrics));
}

export function enrichSiAoiAgriculturalInterpretation(
  report: SiAoiReportModel,
  insights: SiAoiDataInsightsBundle,
  ag: SiAoiAgriculturalInterpretation,
): SiAoiAgriculturalInterpretation {
  const metrics = buildSiAoiInterpretationMetrics(report, insights);
  let temporalInsightForecast = ag.temporalInsightForecast?.trim() || buildTemporalInsightForecast(report, metrics);
  if (!/^Temporal Insight & Forecast:/i.test(temporalInsightForecast)) {
    temporalInsightForecast = `Temporal Insight & Forecast: ${temporalInsightForecast.replace(/^Temporal Insight & Forecast:\s*/i, '')}`;
  }
  temporalInsightForecast = appendCropDiseaseToTemporalForecast(
    temporalInsightForecast,
    report.aoiName,
    cropDiseaseContextFromMetrics(report, metrics),
  );
  const annotate = (s: string) => applyAreaHaToPercentages(s, report.aoiAreaKm2);
  return {
    ...ag,
    insights: ag.insights.map(annotate),
    cropCondition: annotate(ag.cropCondition),
    yieldImpact: annotate(ag.yieldImpact),
    latestImageryDate:
      isoDateOnly(ag.latestImageryDate) ?? resolveLatestImageryDate(report),
    temporalInsightForecast,
  };
}

export function buildSiAoiInterpretationMetrics(
  report: SiAoiReportModel,
  insights: SiAoiDataInsightsBundle,
): SiAoiInterpretationMetrics {
  const sorted = [...report.tableRows].sort((a, b) => b.pct - a.pct);
  const top = sorted[0];
  const second = sorted[1] && sorted[1].pct >= 8 ? sorted[1] : null;
  const stageCtx = spectralContextFromReport(report);

  const live = report.liveLayerAnalysis;
  const ndviRow = insights.indexRows.find(r => r.indexId === 'NDVI');
  const lstRow = insights.indexRows.find(r => r.indexId === 'LST');

  const zonalStub: SiAoiZonalAnalytics | null = live?.indices
    ? ({
        indices: live.indices,
        pixelCount: live.validPixelCount,
        dataSource: 'raster' as const,
      } as SiAoiZonalAnalytics)
    : null;

  const env = deriveEnvironmentalIndicators(zonalStub, lstRow?.mean ?? null);
  const ndmiMean = env.ndmiMean ?? live?.indices?.NDMI?.mean ?? null;
  const ndwiMean = env.ndwiMean ?? live?.indices?.NDWI?.mean ?? null;

  let healthyAreaPct = 0;
  let stressedAreaPct = 0;
  let moderateAreaPct = 0;

  if (live?.cover) {
    healthyAreaPct = live.cover.positivePct;
    stressedAreaPct = live.cover.negativePct;
    moderateAreaPct = Math.max(0, 100 - healthyAreaPct - stressedAreaPct);
  } else {
    for (const row of report.tableRows) {
      if (row.key === 'high') healthyAreaPct += row.pct;
      else if (row.key === 'low') stressedAreaPct += row.pct;
      else if (row.key === 'medium') moderateAreaPct += row.pct;
    }
    if (healthyAreaPct + stressedAreaPct + moderateAreaPct < 1 && sorted.length) {
      const topThird = Math.ceil(sorted.length / 3);
      healthyAreaPct = sorted.slice(0, topThird).reduce((a, r) => a + r.pct, 0);
      stressedAreaPct = sorted.slice(-topThird).reduce((a, r) => a + r.pct, 0);
      moderateAreaPct = Math.max(0, 100 - healthyAreaPct - stressedAreaPct);
    }
  }

  return {
    aoiName: report.aoiName,
    aoiAreaKm2: report.aoiAreaKm2,
    period: `${report.dateStart} – ${report.dateEnd}`,
    indexLabel: report.indexLabel,
    ndviMean: live?.healthPrimaryMean ?? ndviRow?.mean ?? null,
    ndmiMean,
    ndwiMean,
    lstMeanC: env.surfaceTempC ?? lstRow?.mean ?? null,
    soilMoisturePct: env.moisturePct,
    waterPct: env.humidityPct,
    healthyAreaPct: Number(healthyAreaPct.toFixed(1)),
    stressedAreaPct: Number(stressedAreaPct.toFixed(1)),
    moderateAreaPct: Number(moderateAreaPct.toFixed(1)),
    dominantClass: top ? stageForReportTableRow(top, stageCtx) : '—',
    dominantPct: top?.pct ?? 0,
    secondClass: second ? stageForReportTableRow(second, stageCtx) : null,
    secondPct: second?.pct ?? null,
    vegChangePct: insights.dashboard.vegChangePct,
    heatRiskLabel: insights.dashboard.heatRiskLabel,
    stressFlag: Boolean(report.stressNoteEn?.trim()),
    inferredCrop: inferCropFromAoiName(report.aoiName),
  };
}

export function computeSiAoiRiskLevel(m: SiAoiInterpretationMetrics): SiAoiRiskLevel {
  let score = 0;
  if (m.stressedAreaPct >= 35) score += 2;
  else if (m.stressedAreaPct >= 18) score += 1;
  if (m.ndviMean != null && m.ndviMean < 0.22) score += 2;
  else if (m.ndviMean != null && m.ndviMean < 0.35) score += 1;
  if (m.ndmiMean != null && m.ndmiMean < -0.12) score += 1;
  if (m.soilMoisturePct != null && m.soilMoisturePct < 35) score += 1;
  if (m.heatRiskLabel === 'High') score += 2;
  else if (m.heatRiskLabel === 'Moderate') score += 1;
  if (m.stressFlag) score += 1;
  if (m.vegChangePct <= -12) score += 1;
  if (score >= 4) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

function buildRiskCause(
  m: SiAoiInterpretationMetrics,
  risk: SiAoiRiskLevel,
  report?: SiAoiReportModel,
): string | null {
  if (risk === 'Low') return null;
  const parts: string[] = [];
  if (m.ndmiMean != null && m.ndmiMean < -0.08) parts.push('low canopy moisture (NDMI)');
  if (m.heatRiskLabel === 'High' || (m.lstMeanC != null && m.lstMeanC >= 33)) parts.push('heat stress');
  if (m.ndviMean != null && m.ndviMean < 0.3) parts.push('reduced green biomass (NDVI)');
  if (m.stressedAreaPct >= 20) parts.push(`${m.stressedAreaPct.toFixed(0)}% stressed area`);
  if (report && m.inferredCrop) {
    const cropForecast = buildCropDiseaseForecast(report.aoiName, cropDiseaseContextFromMetrics(report, m));
    if (cropForecast?.likelyDiseases.length) {
      parts.push(`${m.inferredCrop.label}: ${cropForecast.likelyDiseases.slice(0, 2).join(' / ')} risk`);
    }
  }
  if (!parts.length && m.stressFlag) parts.push('recent spectral shift in the AOI');
  return parts.length ? parts.slice(0, 4).join(' + ') : 'mixed stress signals across the AOI';
}

function cropConditionLabel(m: SiAoiInterpretationMetrics): string {
  const ndvi = m.ndviMean;
  const ha = (pct: number) => formatSharePctWithHa(pct, m.aoiAreaKm2);
  if (ndvi == null) return 'Crop condition cannot be rated — vegetation index unavailable for this export.';
  if (ndvi >= 0.55 && m.healthyAreaPct >= 45)
    return `Strong crop condition: NDVI ~${fmtIndex('NDVI', ndvi)} with ${ha(m.healthyAreaPct)} in high-productivity classes.`;
  if (ndvi >= 0.35)
    return `Moderate crop condition: NDVI ~${fmtIndex('NDVI', ndvi)}; ${ha(m.healthyAreaPct)} high-vigor vs ${ha(m.stressedAreaPct)} under stress.`;
  return `Weak crop condition: NDVI ~${fmtIndex('NDVI', ndvi)}; stress classes cover ${ha(m.stressedAreaPct)} of the AOI.`;
}

function yieldImpactLabel(m: SiAoiInterpretationMetrics, risk: SiAoiRiskLevel): string {
  const haStrong = formatSharePctWithHa(m.healthyAreaPct, m.aoiAreaKm2);
  const haWeak = formatSharePctWithHa(m.stressedAreaPct, m.aoiAreaKm2);
  if (risk === 'Low') {
    return `Yield outlook is stable: productive zones (${haStrong}) likely support near-normal output; limited spectral stress.`;
  }
  if (risk === 'Medium') {
    return `Yield may be uneven: ${haStrong} still looks productive, but ${haWeak} shows stress that can trim local yields unless irrigation or nutrition is adjusted.`;
  }
  return `Yield is at risk on ${haWeak}; only ${haStrong} remains in strong vigor — expect below-average harvest in stressed parcels this cycle.`;
}

/** Client-side Yield Insight (agronomist-facing) when Gemini is unavailable. */
export function buildSiAoiAgriculturalInterpretation(
  report: SiAoiReportModel,
  insights: SiAoiDataInsightsBundle,
): SiAoiAgriculturalInterpretation {
  const m = buildSiAoiInterpretationMetrics(report, insights);
  const riskLevel = computeSiAoiRiskLevel(m);
  const riskCause = buildRiskCause(m, riskLevel, report);

  const ndviStr = m.ndviMean != null ? fmtIndex('NDVI', m.ndviMean) : 'n/a';
  const ndmiStr = m.ndmiMean != null ? fmtIndex('NDMI', m.ndmiMean) : 'n/a';
  const ndwiStr = m.ndwiMean != null ? fmtIndex('NDWI', m.ndwiMean) : 'n/a';
  const lstStr = m.lstMeanC != null ? `${m.lstMeanC.toFixed(1)}°C` : 'n/a';
  const moistureStr = m.soilMoisturePct != null ? `${m.soilMoisturePct}%` : 'n/a';
  const waterStr = m.waterPct != null ? `${m.waterPct}%` : 'n/a';
  const ha = (pct: number) => formatSharePctWithHa(pct, m.aoiAreaKm2);

  const insightsOut: string[] = [
    `Class distribution: "${m.dominantClass}" covers ${ha(m.dominantPct)} of the AOI${m.secondClass ? `; "${m.secondClass}" at ${ha(m.secondPct!)}.` : '.'}`,
    `Health split: high-vigor ${ha(m.healthyAreaPct)}, moderate ${ha(m.moderateAreaPct)}, stressed ${ha(m.stressedAreaPct)} — use this to target field walks and harvest planning.`,
    `Satellite indices: NDVI mean ~${ndviStr}; soil moisture from NDMI ~${ndmiStr} (${moistureStr}); surface water from NDWI ~${ndwiStr} (${waterStr}).`,
    `Thermal signal: land surface ~${lstStr} (${m.heatRiskLabel.toLowerCase()} heat risk); heat with low NDMI/NDWI often explains yield gaps before visible wilting.`,
    m.inferredCrop
      ? (() => {
          const cropNote = buildCropDiseaseForecast(report.aoiName, cropDiseaseContextFromMetrics(report, m));
          return cropNote
            ? `${m.inferredCrop.label} (from AOI name): Live Index disease watch — ${cropNote.likelyDiseases.slice(0, 2).join(' / ')}; ${cropNote.drivers[0] ?? 'monitor NDMI and LST with timeline trend'}.`
            : `Named crop context: ${m.inferredCrop.label} — interpret stress against crop-specific thresholds.`;
        })()
      : m.vegChangePct >= 5
        ? `Vegetation index rose ~${Math.abs(m.vegChangePct).toFixed(0)}% over the period — biomass is building; excellent zones should track rising yield potential.`
        : m.vegChangePct <= -5
          ? `Vegetation index fell ~${Math.abs(m.vegChangePct).toFixed(0)}% over the period — investigate irrigation, pests, or harvest timing on stressed hectares.`
          : `Vegetation trend is steady (~${m.vegChangePct.toFixed(0)}% change) — yields should follow the current high vs stressed area balance unless field data shows otherwise.`,
  ];

  const recommendations: string[] = [];
  if (riskLevel === 'High') {
    recommendations.push(
      `Prioritize field verification on the ${m.stressedAreaPct.toFixed(0)}% stressed area; sample soil moisture and schedule irrigation within 48–72 h where NDMI is low.`,
    );
  } else if (riskLevel === 'Medium') {
    recommendations.push(
      `Split management: maintain inputs on ${m.healthyAreaPct.toFixed(0)}% high-vigor parcels; run targeted scouting on moderate/stressed patches.`,
    );
  } else {
    recommendations.push(
      `Maintain routine monitoring; keep production records for parcels above NDVI ~${ndviStr} to confirm yield matches the strong spectral signal.`,
    );
  }

  if (m.ndmiMean != null && m.ndmiMean < -0.05) {
    recommendations.push(
      'Increase or verify irrigation on low-NDMI zones; correlate with soil moisture proxy and recent rainfall before adjusting fertilizer.',
    );
  } else {
    recommendations.push(
      'Re-measure in 7–10 days after any irrigation or rain event to confirm moisture and NDVI respond before changing crop inputs.',
    );
  }

  if (m.heatRiskLabel !== 'Low') {
    recommendations.push(
      'Avoid midday field operations in heat-stressed blocks; shift harvest or spraying to cooler hours where LST is elevated.',
    );
  } else {
    recommendations.push(
      'Export parcel-level means for excellent vs good classes and compare with last season yield maps to calibrate harvest forecasts.',
    );
  }

  return enrichSiAoiAgriculturalInterpretation(report, insights, {
    insights: insightsOut.slice(0, SI_AOI_INTERPRETATION_INSIGHT_COUNT),
    recommendations: recommendations.slice(0, SI_AOI_INTERPRETATION_RECOMMENDATION_COUNT),
    riskLevel,
    riskCause,
    cropCondition: cropConditionLabel(m),
    yieldImpact: yieldImpactLabel(m, riskLevel),
    latestImageryDate: resolveLatestImageryDate(report),
    temporalInsightForecast: buildTemporalInsightForecast(report, m),
  });
}

export function parseSiAoiAgriculturalInterpretationJson(text: string): SiAoiAgriculturalInterpretation | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const risk = String(raw.riskLevel ?? '').trim();
    if (risk !== 'Low' && risk !== 'Medium' && risk !== 'High') return null;
    const insights = Array.isArray(raw.insights)
      ? raw.insights.map(s => safeText(String(s))).filter(Boolean)
      : [];
    const recommendations = Array.isArray(raw.recommendations)
      ? raw.recommendations.map(s => safeText(String(s))).filter(Boolean)
      : [];
    if (insights.length < 3 || recommendations.length < 2) return null;
    return {
      insights: insights.slice(0, SI_AOI_INTERPRETATION_INSIGHT_COUNT),
      recommendations: recommendations.slice(0, SI_AOI_INTERPRETATION_RECOMMENDATION_COUNT),
      riskLevel: risk,
      riskCause: raw.riskCause ? safeText(String(raw.riskCause)) : null,
      cropCondition: safeText(String(raw.cropCondition ?? '')),
      yieldImpact: safeText(String(raw.yieldImpact ?? '')),
      latestImageryDate: safeText(String(raw.latestImageryDate ?? '')),
      temporalInsightForecast: safeText(String(raw.temporalInsightForecast ?? '')),
    };
  } catch {
    return null;
  }
}

/** Flat list for legacy PDF callers (insights + condition + yield + risk + recommendations). */
export function flattenSiAoiAgriculturalInterpretation(ag: SiAoiAgriculturalInterpretation): string[] {
  const riskLine =
    ag.riskLevel === 'Low'
      ? 'Overall risk level: Low — no urgent yield threat indicated by current satellite indicators.'
      : `Overall risk level: ${ag.riskLevel}${ag.riskCause ? ` — ${ag.riskCause}` : ''}.`;
  return [
    ...ag.insights,
    ag.cropCondition,
    ag.yieldImpact,
    riskLine,
    ...ag.recommendations,
  ];
}
