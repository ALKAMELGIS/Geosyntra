import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { SI_NDWI_CLASS_LABELS } from '../../../lib/siWmsIndexClassificationRamp';
import { SI_WMS_SPECTRAL_CLASS_COUNT } from './siWmsSpectralClassification';

export type SiWmsIndexLegendInterpretation = {
  low: string;
  medium: string;
  high: string;
};

export type SiWmsIndexLegendScale = {
  min: number;
  max: number;
  interpretation: SiWmsIndexLegendInterpretation;
};

export function siWmsIndexLegendScaleFromStops(stops: readonly IndexRampStop[]): SiWmsIndexLegendScale | null {
  if (!stops.length) return null;
  const min = stops[0]![0];
  const max = stops[stops.length - 1]![0];
  return { min, max, interpretation: siWmsIndexInterpretationForRange(min, max) };
}

function siWmsIndexInterpretationForRange(min: number, max: number): SiWmsIndexLegendInterpretation {
  const mid = (min + max) / 2;
  return {
    low: `Low (${min.toFixed(2)})`,
    medium: `Medium (${mid.toFixed(2)})`,
    high: `High (${max.toFixed(2)})`,
  };
}

const INTERP_BY_PROFILE: Partial<Record<WmsAoiEvalProfile, SiWmsIndexLegendInterpretation>> = {
  ndvi: { low: 'Low stress / bare', medium: 'Moderate canopy', high: 'Dense vegetation' },
  ndwi: { low: 'Dry land', medium: 'Mixed moisture', high: 'Open water' },
  ndmi: { low: 'Dry canopy', medium: 'Moderate moisture', high: 'High moisture' },
  gndvi: { low: 'Low biomass', medium: 'Moderate green', high: 'High biomass' },
  evi: { low: 'Low vigor', medium: 'Moderate vigor', high: 'High vigor' },
  savi: { low: 'Sparse cover', medium: 'Moderate cover', high: 'Dense cover' },
  ndbi: { low: 'Low built-up', medium: 'Mixed surface', high: 'Urban / built-up' },
  lst: { low: 'Cool surface', medium: 'Moderate temperature', high: 'Hot surface' },
  agro_composite: { low: 'Low score / high risk', medium: 'Moderate condition', high: 'High score / healthy' },
  agro_delta: { low: 'Degradation (Δ < 0)', medium: 'Stable (Δ ≈ 0)', high: 'Improvement (Δ > 0)' },
};

export function siWmsIndexLegendInterpretation(
  profile: WmsAoiEvalProfile,
  stops: readonly IndexRampStop[],
): SiWmsIndexLegendInterpretation {
  const scale = siWmsIndexLegendScaleFromStops(stops);
  const preset = INTERP_BY_PROFILE[profile];
  if (preset && scale) {
    return {
      low: `${preset.low} · ${scale.min.toFixed(2)}`,
      medium: `${preset.medium}`,
      high: `${preset.high} · ${scale.max.toFixed(2)}`,
    };
  }
  return scale?.interpretation ?? { low: 'Low', medium: 'Medium', high: 'High' };
}

export function siWmsIndexLegendHint(args: {
  profile: WmsAoiEvalProfile;
  classCount: number;
  customSymbology: boolean;
  mode: 'live' | 'scientific';
}): string {
  const { profile, classCount, customSymbology, mode } = args;
  const n = classCount;
  const live = mode === 'live';

  if (customSymbology) {
    return `Custom symbology — ${n} classes; bands match the AOI WMS evalscript exactly.`;
  }

  switch (profile) {
    case 'ndwi':
      return `Water index — ${n} classes: dry land (green) → neutral (white) → open water (blue).`;
    case 'ndmi':
      return `NDMI — ${n} classes: dry canopy → high plant water content.`;
    case 'lst':
      return `Land surface temperature — ${n} classes: cool (blue) → warm (yellow) → hot (red).`;
    case 'ndvi':
      return live
        ? `Live NDVI — ${n} classes: low vegetation stress (grey) → dense canopy (green).`
        : `Vegetation index — ${n} classes: bare soil / stress → dense healthy canopy.`;
    case 'gndvi':
      return `Green NDVI — ${n} classes; chlorophyll-sensitive vegetation ramp.`;
    case 'evi':
      return `Enhanced vegetation — ${n} classes; high dynamic range canopy signal.`;
    case 'savi':
      return `Soil-adjusted vegetation — ${n} classes; reduced soil brightness bias.`;
    case 'ndbi':
      return `Built-up index — ${n} classes: natural → urbanized surfaces.`;
    case 'agro_composite':
      return `Agro composite index — ${n} classes: low score / stress → healthy / high vigor.`;
    case 'agro_delta':
      return `Change detection (Δ) — ${n} classes: degradation (red) → stable (yellow) → improvement (green).`;
    default:
      return live
        ? `Live layer — ${n}-class spectral ramp by index type; matches map tiles inside AOI.`
        : `Spectral classification — ${n} classes by layer type; colors and ranges match the map tiles and export.`;
  }
}

/** Optional per-class labels aligned to legend row index (top = high index). */
export function siWmsIndexLegendClassLabels(
  profile: WmsAoiEvalProfile,
  rowCount: number,
): readonly string[] | null {
  if (profile === 'ndwi' && SI_NDWI_CLASS_LABELS.length >= rowCount) {
    return SI_NDWI_CLASS_LABELS.slice(0, rowCount);
  }
  if (profile === 'ndmi') {
    const labels = [
      'Very dry vegetation',
      'Dry canopy',
      'Low moisture stress',
      'Moderate moisture',
      'Transition',
      'Moist canopy',
      'High moisture',
      'Saturated canopy',
      'Very wet signal',
      'Maximum moisture',
      'Peak moisture class',
    ];
    return labels.slice(0, rowCount);
  }
  if (profile === 'lst') {
    const labels = [
      'Very cool',
      'Cool',
      'Below average',
      'Moderate cool',
      'Neutral',
      'Moderate warm',
      'Warm',
      'Hot',
      'Very hot',
      'Extreme heat',
      'Maximum heat',
    ];
    return labels.slice(0, rowCount);
  }
  if (profile === 'ndvi' || profile === 'gndvi' || profile === 'evi' || profile === 'savi') {
    const labels = [
      'No vegetation / bare',
      'Very sparse',
      'Sparse / stressed',
      'Low vigor',
      'Moderate-low',
      'Moderate',
      'Healthy',
      'Dense',
      'Very dense',
      'Peak biomass',
      'Maximum vigor',
    ];
    return labels.slice(0, rowCount);
  }
  return null;
}

export const SI_WMS_LIVE_INDEX_DEFAULT_CLASS_COUNT = SI_WMS_SPECTRAL_CLASS_COUNT;
