/**
 * Agronomist-facing crop growth stage labels from spectral class bands.
 * Combines band-level values with AOI-wide NDVI / NDMI / EVI context — not a single fixed threshold.
 */
import type { SiAoiReportModel } from './siAoiVegetationReportModel';
import type { SiIndexClassRow } from './siIndexClassAnalytics';
import type { SiAoiReportTableRow } from './siAoiReportCartographyTypes';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

export type CropGrowthStage =
  | 'Uncultivated Land'
  | 'Beginning Growth'
  | 'Active Growth'
  | 'Peak'
  | 'Stress'
  | 'Degradation';

export type SpectralStageContext = {
  activeLayerId: StaticAoiChartLayerId;
  bandMin: number;
  bandMax: number;
  meanInBand?: number | null;
  ndviMean?: number | null;
  ndmiMean?: number | null;
  eviMean?: number | null;
  conditionLabel?: string;
};

const VEG_LAYER_IDS = new Set<StaticAoiChartLayerId>(['NDVI', 'EVI', 'SAVI', 'GNDVI', 'NDRE']);

function fmtRangeNum(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const s = v.toFixed(3);
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Numeric range only — no "Index" prefix or GIS labels. */
export function formatNumericRangeDisplay(labelOrMin: string | number, max?: number): string {
  if (max != null && Number.isFinite(max)) {
    const min =
      typeof labelOrMin === 'number'
        ? labelOrMin
        : Number(String(labelOrMin).replace(/^Index\s+/i, '').trim());
    if (Number.isFinite(min)) {
      return `${fmtRangeNum(min)}..${fmtRangeNum(max)}`;
    }
  }
  const parsed = parseNumericRange(String(labelOrMin));
  if (parsed) return `${fmtRangeNum(parsed.min)}..${fmtRangeNum(parsed.max)}`;
  const stripped = String(labelOrMin)
    .replace(/^Index\s+/i, '')
    .split('·')[0]
    ?.trim();
  if (!stripped) return '—';
  return stripped.length > 36 ? `${stripped.slice(0, 34)}…` : stripped;
}

export function parseNumericRange(text: string): { min: number; max: number } | null {
  const t = String(text ?? '')
    .replace(/^Index\s+/i, '')
    .trim();
  const m = t.match(/(-?\d+\.?\d*)\s*(?:\.\.|–|—|-|to)\s*(-?\d+\.?\d*)/i);
  if (!m) return null;
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function resolveVigor(ctx: SpectralStageContext): number {
  const mid = ctx.meanInBand ?? (ctx.bandMin + ctx.bandMax) / 2;
  if (VEG_LAYER_IDS.has(ctx.activeLayerId)) return mid;
  if (ctx.ndviMean != null && Number.isFinite(ctx.ndviMean)) {
    return mid * 0.35 + ctx.ndviMean * 0.65;
  }
  if (ctx.eviMean != null && Number.isFinite(ctx.eviMean)) {
    return mid * 0.35 + ctx.eviMean * 0.65;
  }
  return mid;
}

function resolveMoisture(ctx: SpectralStageContext): number | null {
  if (ctx.ndmiMean != null && Number.isFinite(ctx.ndmiMean)) return ctx.ndmiMean;
  if (ctx.activeLayerId === 'NDMI') {
    return ctx.meanInBand ?? (ctx.bandMin + ctx.bandMax) / 2;
  }
  return null;
}

type StageScores = Record<
  'uncultivated' | 'beginning' | 'active' | 'peak' | 'stress' | 'degradation',
  number
>;

function emptyScores(): StageScores {
  return {
    uncultivated: 0,
    beginning: 0,
    active: 0,
    peak: 0,
    stress: 0,
    degradation: 0,
  };
}

function stageFromScores(scores: StageScores): CropGrowthStage {
  const order: Array<[keyof StageScores, CropGrowthStage]> = [
    ['peak', 'Peak'],
    ['active', 'Active Growth'],
    ['beginning', 'Beginning Growth'],
    ['stress', 'Stress'],
    ['degradation', 'Degradation'],
    ['uncultivated', 'Uncultivated Land'],
  ];
  let bestKey: keyof StageScores = 'active';
  let best = -Infinity;
  for (const [key] of order) {
    const s = scores[key];
    if (s > best) {
      best = s;
      bestKey = key;
    }
  }
  return order.find(([k]) => k === bestKey)?.[1] ?? 'Active Growth';
}

/** Multi-index crop growth stage for one spectral class band. */
export function classifyCropGrowthStage(ctx: SpectralStageContext): CropGrowthStage {
  const mid = ctx.meanInBand ?? (ctx.bandMin + ctx.bandMax) / 2;
  const vigor = resolveVigor(ctx);
  const moisture = resolveMoisture(ctx);
  const cond = (ctx.conditionLabel ?? '').toLowerCase();

  if (ctx.activeLayerId === 'NDWI') {
    if (mid < 0.05) return 'Uncultivated Land';
    if (mid >= 0.35 && moisture != null && moisture >= 0) return 'Peak';
    return mid >= 0.15 ? 'Active Growth' : 'Beginning Growth';
  }
  if (ctx.activeLayerId === 'NDBI' || ctx.activeLayerId === 'NDSI') {
    return mid >= 0.25 ? 'Uncultivated Land' : 'Beginning Growth';
  }
  if (ctx.activeLayerId === 'LST') {
    if (mid >= 36) return 'Stress';
    if (mid >= 32 && (moisture == null || moisture < -0.05)) return 'Degradation';
    if (mid >= 28) return 'Active Growth';
    return 'Beginning Growth';
  }

  const scores = emptyScores();

  if (vigor < -0.05) scores.uncultivated += 3;
  else if (vigor < 0.05) scores.uncultivated += 2.5;
  else if (vigor < 0.12) {
    scores.uncultivated += 1;
    scores.degradation += 1;
  }

  if (vigor >= 0.05 && vigor < 0.28) scores.beginning += 2.2;
  if (vigor >= 0.22 && vigor < 0.52) scores.active += 2;
  if (vigor >= 0.45 && vigor < 0.72) scores.active += 1.2;
  if (vigor >= 0.55) scores.peak += 2.4;
  if (vigor >= 0.68) scores.peak += 1.2;

  if (moisture != null) {
    if (moisture < -0.12 && vigor >= 0.18) scores.stress += 2.5;
    else if (moisture < -0.04 && vigor >= 0.15) scores.stress += 1.5;
    if (moisture < -0.08 && vigor < 0.32) scores.degradation += 2;
    if (moisture >= 0.02 && vigor >= 0.42) scores.peak += 1;
    if (moisture >= -0.02 && vigor >= 0.22 && vigor < 0.48) scores.active += 0.8;
    if (moisture >= 0 && vigor < 0.18) scores.beginning += 0.6;
  }

  if (cond.includes('bare') || cond.includes('non-veget') || cond.includes('soil') || cond.includes('water')) {
    scores.uncultivated += 1.8;
  }
  if (cond.includes('stress') || cond.includes('sparse') || cond.includes('dry')) scores.stress += 1.4;
  if (cond.includes('dense') || cond.includes('high') || cond.includes('healthy') || cond.includes('vigor')) {
    scores.peak += 1.2;
  }
  if (cond.includes('moderate') || cond.includes('mid')) scores.active += 0.7;
  if (cond.includes('declin') || cond.includes('senesc') || cond.includes('harvest')) scores.degradation += 1.5;

  if (vigor >= 0.12 && vigor < 0.24 && (moisture == null || moisture <= 0)) scores.degradation += 1.6;

  if (ctx.eviMean != null && VEG_LAYER_IDS.has(ctx.activeLayerId)) {
    if (ctx.eviMean >= 0.45 && vigor >= 0.5) scores.peak += 0.5;
    if (ctx.eviMean < 0.2 && vigor < 0.3) scores.stress += 0.5;
  }

  return stageFromScores(scores);
}

export function spectralContextFromReport(
  report: SiAoiReportModel,
): Pick<SpectralStageContext, 'activeLayerId' | 'ndviMean' | 'ndmiMean' | 'eviMean'> {
  const live = report.liveLayerAnalysis;
  const rows = report.dataInsights?.indexRows ?? [];
  const pick = (id: StaticAoiChartLayerId) =>
    live?.indices?.[id]?.mean ?? rows.find(r => r.indexId === id)?.mean ?? null;
  return {
    activeLayerId: report.indexId,
    ndviMean: pick('NDVI'),
    ndmiMean: pick('NDMI'),
    eviMean: pick('EVI'),
  };
}

export function stageForReportTableRow(
  row: SiAoiReportTableRow,
  ctx: Pick<SpectralStageContext, 'activeLayerId' | 'ndviMean' | 'ndmiMean' | 'eviMean'>,
): CropGrowthStage {
  const range = parseNumericRange(row.labelEn);
  const conditionLabel = row.labelEn.includes('·') ? row.labelEn.split('·').slice(1).join('·').trim() : undefined;
  if (range) {
    return classifyCropGrowthStage({
      ...ctx,
      bandMin: range.min,
      bandMax: range.max,
      conditionLabel,
    });
  }
  return classifyCropGrowthStage({
    ...ctx,
    bandMin: 0,
    bandMax: 0,
    conditionLabel: conditionLabel ?? row.labelEn,
  });
}

export function stageForIndexClassRow(
  row: SiIndexClassRow,
  ctx: Pick<SpectralStageContext, 'activeLayerId' | 'ndviMean' | 'ndmiMean' | 'eviMean'>,
): CropGrowthStage {
  return classifyCropGrowthStage({
    ...ctx,
    bandMin: row.min,
    bandMax: row.max,
    meanInBand: row.meanIndex,
    conditionLabel: row.condition,
  });
}

export function formatReportTableAreaHa(areaKm2: number): string {
  const ha = areaKm2 * 100;
  if (ha >= 100) return `${ha.toFixed(1)} ha`;
  if (ha >= 1) return `${ha.toFixed(2)} ha`;
  return `${ha.toFixed(3)} ha`;
}

/** Agronomist-facing AOI health tiers for infographic pie charts. */
export type AgHealthCategory = 'Healthy' | 'Moderate' | 'Stress' | 'Bare soil';

export const AG_HEALTH_CATEGORY_COLORS: Record<AgHealthCategory, string> = {
  Healthy: '#15803d',
  Moderate: '#ca8a04',
  Stress: '#dc2626',
  'Bare soil': '#78716c',
};

export type AgHealthPieSlice = {
  label: AgHealthCategory;
  pct: number;
  color: string;
};

const AG_HEALTH_ORDER: AgHealthCategory[] = ['Healthy', 'Moderate', 'Stress', 'Bare soil'];

export function cropStageToHealthCategory(stage: CropGrowthStage): AgHealthCategory {
  switch (stage) {
    case 'Peak':
    case 'Active Growth':
      return 'Healthy';
    case 'Beginning Growth':
      return 'Moderate';
    case 'Stress':
      return 'Stress';
    case 'Degradation':
    case 'Uncultivated Land':
    default:
      return 'Bare soil';
  }
}

/** Aggregate legend band shares into four agricultural health categories. */
export function buildAgHealthPieSlices(report: SiAoiReportModel): AgHealthPieSlice[] {
  const stageCtx = spectralContextFromReport(report);
  const buckets: Record<AgHealthCategory, number> = {
    Healthy: 0,
    Moderate: 0,
    Stress: 0,
    'Bare soil': 0,
  };
  for (const row of report.tableRows) {
    const cat = cropStageToHealthCategory(stageForReportTableRow(row, stageCtx));
    buckets[cat] += row.pct;
  }
  return AG_HEALTH_ORDER.filter(k => buckets[k] > 0.05).map(k => ({
    label: k,
    pct: Number(buckets[k].toFixed(1)),
    color: AG_HEALTH_CATEGORY_COLORS[k],
  }));
}
