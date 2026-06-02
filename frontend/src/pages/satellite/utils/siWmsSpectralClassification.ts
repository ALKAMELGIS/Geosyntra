import { inferWmsEvalProfile, type WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { siRampLegendSegments } from '../../../lib/siWmsIndexClassificationRamp';
import {
  SI_WMS_SYMBOLOGY_DEFAULT_UI,
  siAutoRampPresetForLayerName,
  siComputeSymbologyStops,
  mergeSymbologyUi,
  siWmsDefaultStopsForProfile,
  siWmsSymbologySupportsLayer,
  type SiWmsSymbologyUiState,
} from './siWmsSymbologyModel';

/** Number of discrete color classes shown in Live / Scientific legend and WMS evalscript. */
export const SI_WMS_SPECTRAL_CLASS_COUNT = 10;

/** Threshold anchors: N classes ⇒ N+1 stops ⇒ N legend intervals. */
export const SI_WMS_SPECTRAL_STOP_COUNT = SI_WMS_SPECTRAL_CLASS_COUNT + 1;

const CLASSIFIED_PROFILES = new Set<WmsAoiEvalProfile>([
  'ndvi',
  'ndwi',
  'gndvi',
  'ndmi',
  'evi',
  'savi',
  'ndbi',
  'lst',
]);

export function isSpectralClassifiedProfile(profile: WmsAoiEvalProfile): boolean {
  return CLASSIFIED_PROFILES.has(profile);
}

export function siWmsLayerSupportsSpectralClassification(layerId: string): boolean {
  if (!layerId) return false;
  const p = inferWmsEvalProfile(layerId);
  return isSpectralClassifiedProfile(p) || siWmsSymbologySupportsLayer(layerId);
}

function symbologyDiffersFromDefaults(merged: SiWmsSymbologyUiState): boolean {
  const d = SI_WMS_SYMBOLOGY_DEFAULT_UI;
  return (
    merged.rampPreset !== d.rampPreset ||
    merged.classificationType !== d.classificationType ||
    merged.numClasses !== d.numClasses ||
    merged.autoScientific !== d.autoScientific ||
    (merged.opacity01 !== d.opacity01 && Number.isFinite(merged.opacity01))
  );
}

/**
 * Single source of truth for WMS classified stops: map tiles, legends, symbology preview, reports.
 * Auto mode: 10-class quantitative ramp from layer-type domain + spectral preset.
 * Custom symbology panel overrides are applied verbatim when the user changes settings.
 */
export function siWmsResolveCanonicalStops(
  layerId: string,
  symbologyPartial?: Partial<SiWmsSymbologyUiState>,
): readonly IndexRampStop[] | null {
  if (!siWmsLayerSupportsSpectralClassification(layerId)) return null;

  const merged = mergeSymbologyUi(symbologyPartial);
  const hasCustom = symbologyPartial != null && Object.keys(symbologyPartial).length > 0 && symbologyDiffersFromDefaults(merged);

  if (hasCustom) {
    const computed = siComputeSymbologyStops(layerId, merged);
    if (computed && computed.length >= 2) return computed;
  }

  return siWmsAutoSpectralStops(layerId);
}

/** 10-class spectral ramp from layer type (NDVI / NDWI / SAVI / LST / …). */
export function siWmsAutoSpectralStops(layerId: string): readonly IndexRampStop[] | null {
  const ui: SiWmsSymbologyUiState = {
    ...SI_WMS_SYMBOLOGY_DEFAULT_UI,
    autoScientific: true,
    numClasses: SI_WMS_SPECTRAL_CLASS_COUNT,
    classificationType: 'quantitative',
    rampPreset: siAutoRampPresetForLayerName(layerId),
  };
  return siComputeSymbologyStops(layerId, ui);
}

/** Legend rows — exact class intervals from canonical stops (no thinning). */
export function siWmsLegendRowsFromStops(
  stops: readonly IndexRampStop[] | null | undefined,
  maxRows = SI_WMS_SPECTRAL_CLASS_COUNT,
): Array<{ from: number; to: number; color: string }> {
  if (!stops || stops.length < 2) return [];
  const all = siRampLegendSegments(stops);
  if (all.length <= maxRows) return all;
  const step = Math.ceil(all.length / maxRows);
  const out = all.filter((_, i) => i % step === 0);
  const last = all[all.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Canonical 10-class stops for live layer legend — kept here so legend mode never imports this module back. */
export function siWmsLiveLegendStops(
  layerId: string,
  _ui: SiWmsSymbologyUiState,
  symbologyPartial?: Partial<SiWmsSymbologyUiState>,
): readonly IndexRampStop[] | null {
  return siWmsResolveCanonicalStops(layerId, symbologyPartial);
}
