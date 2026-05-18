/**
 * Statistics from real per-pixel spectral values (AOI-clipped raster samples).
 * No symbology, no random/demo values.
 */
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';
import { STATIC_AOI_CHART_LAYER_OPTIONS } from './staticAoiChartTypes';

export type LivePixelStatistics = {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  validCount: number;
  totalCount: number;
  histogram: { binStart: number; binEnd: number; count: number }[];
};

export function finitePixelValues(raw: number[] | undefined | null): number[] {
  if (!raw?.length) return [];
  return raw.filter(v => typeof v === 'number' && Number.isFinite(v));
}

export function computeLivePixelStatistics(values: number[], histogramBins = 24): LivePixelStatistics | null {
  const finite = finitePixelValues(values);
  if (!finite.length) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = finite.reduce((a, b) => a + b, 0) / n;
  const median = percentileSorted(sorted, 0.5);
  const min = sorted[0]!;
  const max = sorted[n - 1]!;
  const variance = finite.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const histogram = buildHistogram(finite, min, max, histogramBins);
  return {
    mean,
    median,
    min,
    max,
    std,
    validCount: n,
    totalCount: values.length,
    histogram,
  };
}

function percentileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const t = (sorted.length - 1) * p;
  const lo = Math.floor(t);
  const hi = Math.ceil(t);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (1 - (t - lo)) + sorted[hi]! * (t - lo);
}

function buildHistogram(
  values: number[],
  min: number,
  max: number,
  bins: number,
): { binStart: number; binEnd: number; count: number }[] {
  const span = Math.max(1e-12, max - min);
  const out: { binStart: number; binEnd: number; count: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const binStart = min + (span * i) / bins;
    const binEnd = min + (span * (i + 1)) / bins;
    out.push({ binStart, binEnd, count: 0 });
  }
  for (const v of values) {
    let idx = Math.floor(((v - min) / span) * bins);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    out[idx]!.count += 1;
  }
  return out;
}

/** Map raster pixels to GeoJSON points for spectral profile / heat overlay. */
export function rasterPixelsToHeatGeoJson(
  grid: Array<{ lng: number; lat: number }>,
  values: number[],
  maxPoints = 1200,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const n = Math.min(grid.length, values.length);
  if (n === 0) return { type: 'FeatureCollection', features: [] };
  const stride = n <= maxPoints ? 1 : Math.ceil(n / maxPoints);
  for (let i = 0; i < n; i += stride) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    const p = grid[i]!;
    features.push({
      type: 'Feature',
      properties: { value: v },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function opticalLayerIdsForSpectralProfile(activeLayerId: StaticAoiChartLayerId): StaticAoiChartLayerId[] {
  const optical: StaticAoiChartLayerId[] = ['NDVI', 'NDWI', 'NDMI', 'SAVI', 'EVI', 'NDSI', 'NDBI'];
  const ordered = [...new Set([activeLayerId, ...optical])].filter(id => id !== 'LST');
  return ordered.filter(id => STATIC_AOI_CHART_LAYER_OPTIONS.some(o => o.id === id)) as StaticAoiChartLayerId[];
}
