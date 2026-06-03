/**
 * AOI popup analysis summaries — NDVI today; extend for NDMI, LST, soil moisture, crop health.
 */
import type { LiveAoiStatsViewModel } from './liveAoiStatsView';
import {
  isPositiveCoverPixel,
  SI_NDVI_CULTIVATED_MIN,
} from './siIndexClassAnalytics';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

export { SI_NDVI_CULTIVATED_MIN };

export type LiveAoiVegetationCondition = 'Poor' | 'Moderate' | 'Good' | 'Excellent';

export type LiveAoiConditionTone = 'poor' | 'moderate' | 'good' | 'excellent';

export type LiveAoiNdviDensityClass =
  | 'Non-Vegetation'
  | 'Sparse Vegetation'
  | 'Moderate Vegetation'
  | 'Healthy Vegetation';

export type LiveAoiNdviClassBand = {
  id: LiveAoiNdviDensityClass;
  rangeLabel: string;
  min: number;
  max: number;
};

export const SI_NDVI_DENSITY_CLASS_BANDS: LiveAoiNdviClassBand[] = [
  { id: 'Non-Vegetation', rangeLabel: '< 0.20', min: -1, max: SI_NDVI_CULTIVATED_MIN },
  { id: 'Sparse Vegetation', rangeLabel: '0.20 – 0.40', min: SI_NDVI_CULTIVATED_MIN, max: 0.4 },
  { id: 'Moderate Vegetation', rangeLabel: '0.40 – 0.60', min: 0.4, max: 0.6 },
  { id: 'Healthy Vegetation', rangeLabel: '> 0.60', min: 0.6, max: 1.05 },
];

export type LiveAoiIndexAnalysisSummary = {
  indicatorId: StaticAoiChartLayerId;
  indicatorLabel: string;
  imageryDateIso: string;
  totalAreaHa: number;
  totalAreaM2: number;
  cultivatedAreaHa: number;
  cultivatedAreaM2: number;
  cultivatedPct: number;
  nonCultivatedAreaHa: number;
  nonCultivatedAreaM2: number;
  averageIndex: number | null;
  condition: LiveAoiVegetationCondition;
  conditionTone: LiveAoiConditionTone;
  interpretation: string;
};

export function classifyNdviPixelDensity(value: number): LiveAoiNdviDensityClass {
  if (!Number.isFinite(value) || value <= SI_NDVI_CULTIVATED_MIN) return 'Non-Vegetation';
  if (value <= 0.4) return 'Sparse Vegetation';
  if (value <= 0.6) return 'Moderate Vegetation';
  return 'Healthy Vegetation';
}

export function classifyNdviMeanToCondition(mean: number): LiveAoiVegetationCondition {
  if (!Number.isFinite(mean) || mean <= SI_NDVI_CULTIVATED_MIN) return 'Poor';
  if (mean <= 0.4) return 'Moderate';
  if (mean <= 0.6) return 'Good';
  return 'Excellent';
}

export function conditionToneForVegetation(
  condition: LiveAoiVegetationCondition,
): LiveAoiConditionTone {
  switch (condition) {
    case 'Poor':
      return 'poor';
    case 'Moderate':
      return 'moderate';
    case 'Good':
      return 'good';
    default:
      return 'excellent';
  }
}

function formatHaForInterpretation(ha: number): string {
  if (!Number.isFinite(ha)) return '—';
  if (ha >= 100) return ha.toFixed(1);
  if (ha >= 10) return ha.toFixed(2);
  return ha.toFixed(3);
}

export function buildNdviInterpretationText(args: {
  cultivatedAreaHa: number;
  cultivatedPct: number;
  condition: LiveAoiVegetationCondition;
}): string {
  const ha = formatHaForInterpretation(args.cultivatedAreaHa);
  const pct =
    Number.isFinite(args.cultivatedPct) && args.cultivatedPct >= 0
      ? args.cultivatedPct.toFixed(1)
      : '—';
  return `Based on the latest NDVI imagery, approximately ${ha} hectares are actively vegetated within the AOI. Vegetation health is classified as ${args.condition}, representing ${pct}% of the total AOI area.`;
}

const VEGETATION_INDEX_IDS: StaticAoiChartLayerId[] = ['NDVI', 'SAVI', 'EVI', 'GNDVI'];

export function supportsLiveAoiIndexAnalysis(layerId: StaticAoiChartLayerId): boolean {
  return VEGETATION_INDEX_IDS.includes(layerId);
}

/** Build popup summary for the active spectral index (NDVI family fully supported). */
export function buildLiveAoiIndexAnalysisSummary(
  model: LiveAoiStatsViewModel,
): LiveAoiIndexAnalysisSummary | null {
  if (!supportsLiveAoiIndexAnalysis(model.layerId)) return null;

  const cover = model.cover;
  const mean = model.mean;
  if (!cover || mean == null || !Number.isFinite(mean)) return null;

  const condition = classifyNdviMeanToCondition(mean);
  const cultivatedPct = cover.positivePct;

  return {
    indicatorId: model.layerId,
    indicatorLabel: model.layerId === 'NDVI' ? 'NDVI Analysis' : `${model.layerId} Analysis`,
    imageryDateIso: model.analysisDateIso,
    totalAreaHa: model.areaHa,
    totalAreaM2: model.areaM2,
    cultivatedAreaHa: cover.positiveAreaHa,
    cultivatedAreaM2: cover.positiveAreaM2,
    cultivatedPct,
    nonCultivatedAreaHa: cover.negativeAreaHa,
    nonCultivatedAreaM2: cover.negativeAreaM2,
    averageIndex: mean,
    condition,
    conditionTone: conditionToneForVegetation(condition),
    interpretation: buildNdviInterpretationText({
      cultivatedAreaHa: cover.positiveAreaHa,
      cultivatedPct,
      condition,
    }),
  };
}

/** Re-export threshold helper used by zonal classification. */
export function isNdviCultivatedPixel(value: number): boolean {
  return isPositiveCoverPixel('NDVI', value);
}
