/**
 * Pixel-based spectral index classification inside an AOI — one active layer only.
 * Area shares are proportional to valid masked pixel counts (m², ha, km²).
 */
import { inferWmsEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import { SI_NDWI_CLASS_LABELS, type IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { siWmsDefaultStopsForProfile } from './siWmsSymbologyModel';
import { siWmsIndexLegendClassLabels } from './siWmsLiveIndexLegendConfig';
import { siWmsRampClassIntervals } from './siWmsSpectralClassification';
import { classifyValue, legendClassesForIndex, type LegendClass } from './siGeoAiIndexAnalyticalExport';
import {
  extractMaskedPixelValues,
  type SiAoiRasterPixelSample,
} from './siAoiZonalStats';
import { minMaxFinite } from './siChartStatFormat';
import type { SiAoiReportTableRow } from './siAoiReportCartographyTypes';

export type SiAoiLegendBandCount = 5 | 10;
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

/** Cultivated / active vegetation threshold for NDVI-family indices (strictly greater). */
export const SI_NDVI_CULTIVATED_MIN = 0.2;
import { STATIC_AOI_CHART_LAYER_OPTIONS } from './staticAoiChartTypes';

export type SiIndexClassSegment = {
  classId: number;
  label: string;
  min: number;
  max: number;
  colorHex: string;
  condition: string;
};

export type SiIndexClassRow = SiIndexClassSegment & {
  pixelCount: number;
  pct: number;
  areaM2: number;
  areaHa: number;
  areaKm2: number;
  meanIndex: number | null;
};

export type SiIndexCoverPair = {
  positiveLabel: string;
  negativeLabel: string;
  positivePct: number;
  negativePct: number;
  positiveAreaM2: number;
  negativeAreaM2: number;
  positiveAreaHa: number;
  negativeAreaHa: number;
  positiveAreaKm2: number;
  negativeAreaKm2: number;
};

export type SiIndexClassAnalytics = {
  layerId: StaticAoiChartLayerId;
  layerLabel: string;
  analysisDateIso: string;
  legendBandCount: SiAoiLegendBandCount;
  totalAreaM2: number;
  totalAreaHa: number;
  totalAreaKm2: number;
  validPixelCount: number;
  approxM2PerPixel: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  classes: SiIndexClassRow[];
  cover: SiIndexCoverPair | null;
};

function stopsForLayer(layerId: StaticAoiChartLayerId): readonly IndexRampStop[] {
  const profile = inferWmsEvalProfile(layerId);
  return siWmsDefaultStopsForProfile(profile) ?? siWmsDefaultStopsForProfile('ndvi')!;
}

function segmentLabelsForLayer(layerId: StaticAoiChartLayerId, segmentCount: number): string[] | null {
  if (layerId === 'NDWI' && segmentCount === SI_NDWI_CLASS_LABELS.length) {
    return [...SI_NDWI_CLASS_LABELS];
  }
  return null;
}

/** Legend-aligned segments from the same ramp intervals as WMS + map legend. */
export function buildIndexClassSegmentsFromRampStops(
  layerId: StaticAoiChartLayerId,
  stops: readonly IndexRampStop[],
  bandCount: SiAoiLegendBandCount,
): SiIndexClassSegment[] {
  const intervals = siWmsRampClassIntervals(stops, bandCount);
  if (!intervals.length) return [];

  const profile = inferWmsEvalProfile(layerId);
  const wmsLabels = siWmsIndexLegendClassLabels(profile, intervals.length);
  const ndwiLabels = segmentLabelsForLayer(layerId, intervals.length);
  const legend = legendClassesForIndex(layerId);

  return intervals.map((seg, i) => {
    const mid = (seg.from + seg.to) / 2;
    const cls = classifyValue(mid, legend);
    const rampLabel =
      wmsLabels?.[i] ?? ndwiLabels?.[Math.min(i, (ndwiLabels?.length ?? 1) - 1)] ?? cls.name;
    return {
      classId: i + 1,
      label: `${seg.from.toFixed(3)} – ${seg.to.toFixed(3)}`,
      min: seg.from,
      max: seg.to,
      colorHex: seg.color,
      condition: rampLabel,
    };
  });
}

/** Legend-aligned segments for map/report (5 or 10 bands). */
export function buildIndexClassSegments(
  layerId: StaticAoiChartLayerId,
  bandCount: SiAoiLegendBandCount,
): SiIndexClassSegment[] {
  return buildIndexClassSegmentsFromRampStops(layerId, stopsForLayer(layerId), bandCount);
}

function valueInSegment(value: number, seg: SiIndexClassSegment, isLast: boolean): boolean {
  if (!Number.isFinite(value)) return false;
  return value >= seg.min && (isLast ? value <= seg.max : value < seg.max);
}

function classifyToSegment(value: number, segments: SiIndexClassSegment[]): SiIndexClassSegment | null {
  if (!Number.isFinite(value)) return null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (valueInSegment(value, seg, i === segments.length - 1)) return seg;
  }
  const last = segments[segments.length - 1];
  if (last && value >= last.min) return last;
  return segments[0] ?? null;
}

/** Index-specific binary cover (e.g. vegetated vs non-vegetated for NDVI). */
export function isPositiveCoverPixel(layerId: StaticAoiChartLayerId, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  switch (layerId) {
    case 'NDVI':
    case 'SAVI':
    case 'EVI':
    case 'GNDVI':
      return value > SI_NDVI_CULTIVATED_MIN;
    case 'NDWI':
      return value >= 0.15;
    case 'NDMI':
      return value >= 0.15;
    case 'NDBI':
      return value >= 0.1;
    case 'NDSI':
      return value >= 0.2;
    default:
      return value >= 0;
  }
}

export function coverLabelsForLayer(layerId: StaticAoiChartLayerId): {
  positive: string;
  negative: string;
} {
  switch (layerId) {
    case 'NDWI':
      return { positive: 'Water / high moisture', negative: 'Non-water surface' };
    case 'NDMI':
      return { positive: 'Moist canopy / surface', negative: 'Dry / low moisture' };
    case 'NDBI':
      return { positive: 'Built-up / urban', negative: 'Non-built surface' };
    case 'NDSI':
      return { positive: 'Snow / ice signal', negative: 'Snow-free surface' };
    case 'NDVI':
    case 'SAVI':
    case 'EVI':
    case 'GNDVI':
    default:
      return { positive: 'Vegetated', negative: 'Non-vegetated' };
  }
}

function statsFromValues(values: number[]): {
  mean: number;
  min: number;
  max: number;
} | null {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  const bounds = minMaxFinite(finite);
  if (!bounds) return null;
  return {
    mean: finite.reduce((a, b) => a + b, 0) / finite.length,
    min: bounds.min,
    max: bounds.max,
  };
}

export function computeIndexClassAnalytics(opts: {
  layerId: StaticAoiChartLayerId;
  values: number[];
  totalAreaM2: number;
  analysisDateIso: string;
  legendBandCount?: SiAoiLegendBandCount;
  /** Same stops as WMS evalscript / map legend — keeps swatches identical everywhere. */
  classifiedStops?: readonly IndexRampStop[] | null;
}): SiIndexClassAnalytics | null {
  const values = opts.values.filter(Number.isFinite);
  if (!values.length || !Number.isFinite(opts.totalAreaM2) || opts.totalAreaM2 <= 0) return null;

  const bandCount: SiAoiLegendBandCount = opts.legendBandCount === 10 ? 10 : 5;
  const segments =
    opts.classifiedStops && opts.classifiedStops.length >= 2
      ? buildIndexClassSegmentsFromRampStops(opts.layerId, opts.classifiedStops, bandCount)
      : buildIndexClassSegments(opts.layerId, bandCount);
  const m2PerPixel = opts.totalAreaM2 / values.length;
  const layerMeta = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === opts.layerId);

  const classBuckets = new Map<number, { seg: SiIndexClassSegment; count: number; sum: number }>();
  for (const seg of segments) {
    classBuckets.set(seg.classId, { seg, count: 0, sum: 0 });
  }

  let posCount = 0;
  let sumAll = 0;
  let minAll = Infinity;
  let maxAll = -Infinity;
  for (const v of values) {
    sumAll += v;
    if (v < minAll) minAll = v;
    if (v > maxAll) maxAll = v;
    const seg = classifyToSegment(v, segments);
    if (seg) {
      const b = classBuckets.get(seg.classId);
      if (b) {
        b.count++;
        b.sum += v;
      }
    }
    if (isPositiveCoverPixel(opts.layerId, v)) posCount++;
  }

  const total = values.length;
  const classes: SiIndexClassRow[] = segments.map(seg => {
    const bucket = classBuckets.get(seg.classId);
    const n = bucket?.count ?? 0;
    const pct = (100 * n) / total;
    const areaM2 = n * m2PerPixel;
    const meanIndex = n > 0 && bucket ? bucket.sum / n : null;
    return {
      ...seg,
      pixelCount: n,
      pct,
      areaM2,
      areaHa: areaM2 / 10000,
      areaKm2: areaM2 / 1_000_000,
      meanIndex,
    };
  });

  const global =
    total > 0 && Number.isFinite(minAll) && Number.isFinite(maxAll)
      ? { mean: sumAll / total, min: minAll, max: maxAll }
      : null;
  const labels = coverLabelsForLayer(opts.layerId);
  const negCount = total - posCount;
  const cover: SiIndexCoverPair = {
    positiveLabel: labels.positive,
    negativeLabel: labels.negative,
    positivePct: (100 * posCount) / total,
    negativePct: (100 * negCount) / total,
    positiveAreaM2: posCount * m2PerPixel,
    negativeAreaM2: negCount * m2PerPixel,
    positiveAreaHa: (posCount * m2PerPixel) / 10000,
    negativeAreaHa: (negCount * m2PerPixel) / 10000,
    positiveAreaKm2: (posCount * m2PerPixel) / 1_000_000,
    negativeAreaKm2: (negCount * m2PerPixel) / 1_000_000,
  };

  return {
    layerId: opts.layerId,
    layerLabel: layerMeta?.label ?? opts.layerId,
    analysisDateIso: opts.analysisDateIso.slice(0, 10),
    legendBandCount: bandCount,
    totalAreaM2: opts.totalAreaM2,
    totalAreaHa: opts.totalAreaM2 / 10000,
    totalAreaKm2: opts.totalAreaM2 / 1_000_000,
    validPixelCount: total,
    approxM2PerPixel: m2PerPixel,
    mean: global?.mean ?? null,
    min: global?.min ?? null,
    max: global?.max ?? null,
    classes,
    cover,
  };
}

export function computeIndexClassAnalyticsFromRaster(opts: {
  raster: SiAoiRasterPixelSample;
  layerId: StaticAoiChartLayerId;
  feature?: GeoJSON.Feature | null;
  analysisDateIso: string;
  legendBandCount?: SiAoiLegendBandCount;
  classifiedStops?: readonly IndexRampStop[] | null;
  /** Geodesic AOI area (m²) — distributes class shares across masked pixels when raster.areaHa is unset. */
  totalAreaM2Override?: number | null;
}): SiIndexClassAnalytics | null {
  const values = extractMaskedPixelValues(opts.raster, opts.layerId, opts.feature);
  const areaM2 =
    opts.totalAreaM2Override != null &&
    Number.isFinite(opts.totalAreaM2Override) &&
    opts.totalAreaM2Override > 0
      ? opts.totalAreaM2Override
      : Number.isFinite(opts.raster.areaHa) && opts.raster.areaHa > 0
        ? opts.raster.areaHa * 10000
        : values.length > 0 && opts.raster.resolutionM
          ? values.length * opts.raster.resolutionM * opts.raster.resolutionM
          : 0;
  if (!values.length || areaM2 <= 0) return null;
  return computeIndexClassAnalytics({
    layerId: opts.layerId,
    values,
    totalAreaM2: areaM2,
    analysisDateIso: opts.analysisDateIso,
    legendBandCount: opts.legendBandCount,
    classifiedStops: opts.classifiedStops,
  });
}

export function classRowsToReportTableRows(classes: SiIndexClassRow[]): SiAoiReportTableRow[] {
  return classes.map((c, i) => ({
    key: `cls${c.classId}`,
    labelEn: `${c.label} · ${c.condition}`,
    pct: c.pct,
    areaKm2: c.areaKm2,
    colorHex: c.colorHex,
  }));
}

export function nearestRasterPixelValue(
  raster: SiAoiRasterPixelSample,
  layerId: StaticAoiChartLayerId,
  lng: number,
  lat: number,
): number | null {
  const grid = raster.grid;
  const raw = raster.layers[layerId];
  if (!grid?.length || !raw?.length) return null;
  let best = -1;
  let bestD = Infinity;
  const n = Math.min(grid.length, raw.length);
  for (let i = 0; i < n; i++) {
    const p = grid[i]!;
    const d = (p.lng - lng) ** 2 + (p.lat - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return null;
  const v = raw[best]!;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function classAtRasterClick(opts: {
  raster: SiAoiRasterPixelSample;
  layerId: StaticAoiChartLayerId;
  lng: number;
  lat: number;
  analytics: SiIndexClassAnalytics;
}): (SiIndexClassRow & { pixelValue: number }) | null {
  const v = nearestRasterPixelValue(opts.raster, opts.layerId, opts.lng, opts.lat);
  if (v == null) return null;
  const seg = classifyToSegment(v, opts.analytics.classes);
  if (!seg) return null;
  const row = opts.analytics.classes.find(c => c.classId === seg.classId);
  if (!row) return null;
  return { ...row, pixelValue: v };
}

export function formatAreaTriple(areaM2: number): { m2: string; ha: string; km2: string } {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    return { m2: '—', ha: '—', km2: '—' };
  }
  const ha = areaM2 / 10000;
  const km2 = areaM2 / 1_000_000;
  const m2 =
    areaM2 >= 10_000
      ? Math.round(areaM2).toLocaleString('en-US')
      : (Math.round(areaM2 * 10) / 10).toLocaleString('en-US');
  const haStr =
    ha >= 1000 ? ha.toFixed(1) : ha >= 100 ? ha.toFixed(2) : ha >= 1 ? ha.toFixed(3) : ha.toFixed(4);
  const km2Str = km2 >= 1 ? km2.toFixed(4) : km2.toFixed(6);
  return { m2, ha: haStr, km2: km2Str };
}

/** Re-export for tests — classify single value against full 10-class legend. */
export function classifyAgainstFullLegend(
  value: number,
  layerId: StaticAoiChartLayerId,
): { id: number; name: string } {
  return classifyValue(value, legendClassesForIndex(layerId));
}

export type { LegendClass };
