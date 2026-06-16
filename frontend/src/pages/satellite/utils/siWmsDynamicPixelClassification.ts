/**
 * AOI-driven histogram stretch for WMS spectral classification.
 * Reclassifies live raster pixels into 10 color classes using actual min/max inside the AOI
 * so narrow value ranges never collapse into a flat single-color ramp.
 */
import { inferWmsEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import {
  siWmsResampleRampToClassCount,
  type IndexRampStop,
} from '../../../lib/siWmsIndexClassificationRamp';
import { extractMaskedPixelValues, type SiAoiRasterPixelSample } from './siAoiZonalStats';
import {
  SI_WMS_SPECTRAL_CLASS_COUNT,
  SI_WMS_SPECTRAL_STOP_COUNT,
} from './siWmsSpectralClassification';
import { siWmsDefaultStopsForLayer } from './siWmsSymbologyModel';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

/** Values closer than this are treated as spatially uniform inside the AOI sample. */
export const SI_WMS_AOI_UNIFORM_EPSILON = 1e-7;

/** Minimum value span when AOI pixels are uniform — keeps 10-class ramps (never 2 identical stops). */
export const SI_WMS_AOI_MIN_CLASSIFICATION_SPREAD = 0.04;

export type AoiRasterValueRange = {
  min: number;
  max: number;
  count: number;
  spread: number;
  isUniform: boolean;
};

export function computeAoiRasterValueRange(values: readonly number[]): AoiRasterValueRange | null {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const spread = max - min;
  return {
    min,
    max,
    count: finite.length,
    spread,
    isUniform: spread <= SI_WMS_AOI_UNIFORM_EPSILON,
  };
}

/**
 * Build N+1 classification stops stretched between AOI min/max.
 * Colors are sampled from the scientific index ramp at each threshold (not positional resampling).
 */
export function siWmsBuildAoiHistogramStretchStops(
  scientificStops: readonly IndexRampStop[],
  aoiMin: number,
  aoiMax: number,
  classCount = SI_WMS_SPECTRAL_CLASS_COUNT,
): IndexRampStop[] {
  if (!scientificStops.length) return [];
  const stopCount = Math.max(2, classCount + 1);
  const spread = aoiMax - aoiMin;

  if (spread <= SI_WMS_AOI_UNIFORM_EPSILON) {
    const center = (aoiMin + aoiMax) / 2;
    const domainMin = scientificStops[0]![0];
    const domainMax = scientificStops[scientificStops.length - 1]![0];
    const domainSpan = domainMax - domainMin || 1;
    const half = Math.max(SI_WMS_AOI_MIN_CLASSIFICATION_SPREAD / 2, domainSpan * 0.05);
    const paddedMin = Math.max(domainMin, center - half);
    const paddedMax = Math.min(domainMax, center + half);
    const effectiveSpread = paddedMax - paddedMin;
    const discretePalette = siWmsResampleRampToClassCount(scientificStops, stopCount);
    const out: IndexRampStop[] = [];
    for (let i = 0; i < stopCount; i++) {
      const u = stopCount <= 1 ? 0 : i / (stopCount - 1);
      const t = paddedMin + effectiveSpread * u;
      out.push([t, discretePalette[i]![1]]);
    }
    return out;
  }

  const out: IndexRampStop[] = [];
  const discretePalette = siWmsResampleRampToClassCount(scientificStops, stopCount);
  for (let i = 0; i < stopCount; i++) {
    const u = stopCount <= 1 ? 0 : i / (stopCount - 1);
    const t = aoiMin + spread * u;
    out.push([t, discretePalette[i]![1]]);
  }
  return out;
}

/** Apply AOI histogram stretch to global auto-classification stops (auto symbology only). */
export function siWmsApplyDynamicAoiStretch(
  layerId: string,
  globalStops: readonly IndexRampStop[] | null,
  aoiValues: readonly number[] | null | undefined,
): readonly IndexRampStop[] | null {
  if (!globalStops?.length) return globalStops;
  if (!aoiValues?.length) return globalStops;

  const range = computeAoiRasterValueRange(aoiValues);
  if (!range || range.count < 1) return globalStops;

  const scientificBase = siWmsDefaultStopsForLayer(layerId);
  if (!scientificBase?.length) return globalStops;

  const stretched = siWmsBuildAoiHistogramStretchStops(scientificBase, range.min, range.max);
  return stretched.length >= 2 ? stretched : globalStops;
}

/** Masked pixel values for dynamic classification — same source as analytics / popups. */
export function extractWmsAoiDynamicClassificationValues(
  raster: SiAoiRasterPixelSample | null | undefined,
  wmsLayerId: string,
  chartLayerId: StaticAoiChartLayerId,
  feature?: GeoJSON.Feature | null,
): number[] {
  if (!raster?.grid?.length) return [];

  const profile = inferWmsEvalProfile(wmsLayerId);
  const primaryKey: StaticAoiChartLayerId =
    profile === 'agro_composite' || profile === 'agro_delta'
      ? (wmsLayerId.trim() as StaticAoiChartLayerId)
      : chartLayerId;

  let vals = extractMaskedPixelValues(raster, primaryKey, feature);
  if (!vals.length) {
    for (const id of Object.keys(raster.layers) as StaticAoiChartLayerId[]) {
      vals = extractMaskedPixelValues(raster, id, feature);
      if (vals.length) break;
    }
  }
  return vals;
}

export function siWmsDynamicStretchStopCount(stops: readonly IndexRampStop[] | null | undefined): number {
  return stops?.length ?? 0;
}

export { SI_WMS_SPECTRAL_STOP_COUNT };
