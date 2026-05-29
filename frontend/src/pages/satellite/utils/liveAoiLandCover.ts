import type { StaticAoiChartLayerId } from './staticAoiChartTypes';
import { finitePixelValues } from './liveAoiSpectralStats';

export type LandCoverBreakdown = {
  vegetationPct: number;
  waterPct: number;
  urbanPct: number;
  soilPct: number;
  otherPct: number;
  sampleCount: number;
};

/**
 * Per-pixel land-cover fractions from real index values (not map colors).
 * Uses NDVI / NDWI / NDBI when available; each pixel assigned one dominant class.
 */
export function computeLandCoverFromRasterLayers(
  layers: Partial<Record<StaticAoiChartLayerId, number[]>>,
): LandCoverBreakdown | null {
  const ndvi = finitePixelValues(layers.NDVI);
  const ndwi = finitePixelValues(layers.NDWI);
  const ndbi = finitePixelValues(layers.NDBI);
  const ndmi = finitePixelValues(layers.NDMI);

  const n = Math.max(ndvi.length, ndwi.length, ndbi.length, ndmi.length);
  if (n < 1) return null;

  let vegetation = 0;
  let water = 0;
  let urban = 0;
  let soil = 0;
  let other = 0;

  for (let i = 0; i < n; i++) {
    const v = Number.isFinite(ndvi[i]) ? ndvi[i]! : NaN;
    const w = Number.isFinite(ndwi[i]) ? ndwi[i]! : NaN;
    const u = Number.isFinite(ndbi[i]) ? ndbi[i]! : NaN;
    const m = Number.isFinite(ndmi[i]) ? ndmi[i]! : NaN;

    if (Number.isFinite(w) && w >= 0.2) {
      water += 1;
      continue;
    }
    if (Number.isFinite(u) && u >= 0.08) {
      urban += 1;
      continue;
    }
    if (Number.isFinite(v) && v >= 0.2) {
      vegetation += 1;
      continue;
    }
    if (Number.isFinite(m) && m >= 0.15) {
      vegetation += 1;
      continue;
    }
    if (Number.isFinite(v) && v < 0.1 && (!Number.isFinite(w) || w < 0)) {
      soil += 1;
      continue;
    }
    other += 1;
  }

  const total = vegetation + water + urban + soil + other;
  if (total < 1) return null;
  const pct = (x: number) => (100 * x) / total;

  return {
    vegetationPct: pct(vegetation),
    waterPct: pct(water),
    urbanPct: pct(urban),
    soilPct: pct(soil),
    otherPct: pct(other),
    sampleCount: total,
  };
}
