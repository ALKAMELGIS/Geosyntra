import type { SiAoiZonalAnalytics } from './siAoiZonalStats';
import { roundIndexDisplay } from './siAoiZonalStats';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

/** Derived from real AOI pixel means — not random placeholders. */
export type LiveAoiEnvironmentalIndicators = {
  moisturePct: number | null;
  humidityPct: number | null;
  surfaceTempC: number | null;
  ndmiMean: number | null;
  ndwiMean: number | null;
};

/** Map NDMI mean (−1…1) to a 0–100% moisture proxy for UI. */
export function ndmiMeanToMoisturePct(ndmi: number): number {
  const t = Math.max(-1, Math.min(1, ndmi));
  return Math.round(((t + 0.2) / 1.1) * 100);
}

/** Map NDWI mean (−1…1) to a 0–100% humidity / water-content proxy. */
export function ndwiMeanToHumidityPct(ndwi: number): number {
  const t = Math.max(-1, Math.min(1, ndwi));
  return Math.round(((t + 0.35) / 1.35) * 100);
}

export function deriveEnvironmentalIndicators(
  zonal: SiAoiZonalAnalytics | null,
  lstMean: number | null | undefined,
): LiveAoiEnvironmentalIndicators {
  const ndmiMean = zonal?.indices.NDMI?.mean;
  const ndwiMean = zonal?.indices.NDWI?.mean;
  const moisturePct =
    ndmiMean != null && Number.isFinite(ndmiMean) ? ndmiMeanToMoisturePct(ndmiMean) : null;
  const humidityPct =
    ndwiMean != null && Number.isFinite(ndwiMean) ? ndwiMeanToHumidityPct(ndwiMean) : null;
  const surfaceTempC =
    lstMean != null && Number.isFinite(lstMean)
      ? Math.round(lstMean * 10) / 10
      : null;
  return {
    moisturePct,
    humidityPct,
    surfaceTempC,
    ndmiMean: ndmiMean ?? null,
    ndwiMean: ndwiMean ?? null,
  };
}

export type LiveAoiActiveIndexStats = {
  layerId: StaticAoiChartLayerId;
  mean: number;
  min: number;
  max: number;
  std: number;
  pixelCount: number;
  validPixelCount: number;
};

export function activeIndexStatsFromZonal(
  zonal: SiAoiZonalAnalytics | null,
  layerId: StaticAoiChartLayerId,
): LiveAoiActiveIndexStats | null {
  const st = zonal?.indices[layerId];
  if (!st || !Number.isFinite(st.mean)) return null;
  return {
    layerId,
    mean: st.mean,
    min: st.min,
    max: st.max,
    std: st.std ?? 0,
    pixelCount: zonal.pixelCount,
    validPixelCount: st.validCount,
  };
}

export function formatEnvironmentalDisplay(
  env: LiveAoiEnvironmentalIndicators,
): { moisture: string; humidity: string; surfaceTemp: string } {
  return {
    moisture: env.moisturePct != null ? `${env.moisturePct}%` : '—',
    humidity: env.humidityPct != null ? `${env.humidityPct}%` : '—',
    surfaceTemp:
      env.surfaceTempC != null
        ? `${env.surfaceTempC.toFixed(1)}°C`
        : '—',
  };
}

export function formatActiveIndexStat(
  value: number,
  layerId: StaticAoiChartLayerId,
  kind: 'mean' | 'min' | 'max' | 'std',
): string {
  if (!Number.isFinite(value)) return '—';
  if (kind === 'std') return layerId === 'LST' ? value.toFixed(2) : value.toFixed(3);
  return roundIndexDisplay(value, layerId);
}
