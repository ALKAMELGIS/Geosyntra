import { inferWmsEvalProfile, type WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import {
  SI_WMS_SYMBOLOGY_DEFAULT_UI,
  SI_SYM_PRESET_STOPS,
  siAutoRampPresetForLayerName,
  siComputeSymbologyStops,
  siWmsDefaultStopsForProfile,
  siWmsSymbologySupportsLayer,
  type SiWmsSymbologyUiState,
} from './siWmsSymbologyModel';

export type SiWmsLegendDisplayMode = 'none' | 'live' | 'scientific';

const CLASSIFIED_PROFILES = new Set<WmsAoiEvalProfile>(['ndvi', 'ndwi', 'gndvi', 'ndmi', 'evi']);

export function isClassifiedWmsProfile(profile: WmsAoiEvalProfile): boolean {
  return CLASSIFIED_PROFILES.has(profile);
}

export function wmsProfileShowsLegend(profile: WmsAoiEvalProfile): boolean {
  return profile !== 'native';
}

export function mergeSymbologyUi(partial?: Partial<SiWmsSymbologyUiState>): SiWmsSymbologyUiState {
  return { ...SI_WMS_SYMBOLOGY_DEFAULT_UI, ...partial };
}

/**
 * Live = layer preview ramp (no AOI scientific bands).
 * Scientific = full classified symbology + legend (AOI + Auto scientific).
 */
export function siWmsResolveLegendDisplayMode(opts: {
  profile: WmsAoiEvalProfile;
  layerId: string;
  sentinelVisible: boolean;
  hasAoiGeometry: boolean;
  symbologyPartial?: Partial<SiWmsSymbologyUiState>;
}): SiWmsLegendDisplayMode {
  const { profile, layerId, sentinelVisible, hasAoiGeometry, symbologyPartial } = opts;
  if (!sentinelVisible || !layerId || !wmsProfileShowsLegend(profile)) return 'none';
  if (!isClassifiedWmsProfile(profile)) return 'live';
  const ui = mergeSymbologyUi(symbologyPartial);
  if (hasAoiGeometry && ui.autoScientific) return 'scientific';
  return 'live';
}

/** Gradient stops for the Live legend — matches map colors (defaults or custom ramp). */
export function siWmsLiveLegendStops(
  layerId: string,
  ui: SiWmsSymbologyUiState,
  symbologyPartial?: Partial<SiWmsSymbologyUiState>,
): readonly IndexRampStop[] | null {
  if (!layerId || !siWmsSymbologySupportsLayer(layerId)) return null;
  const hasCustom = symbologyPartial != null && Object.keys(symbologyPartial).length > 0;
  if (!hasCustom) {
    return siWmsDefaultStopsForProfile(inferWmsEvalProfile(layerId));
  }
  const liveUi: SiWmsSymbologyUiState = { ...ui, autoScientific: false };
  const computed = siComputeSymbologyStops(layerId, liveUi);
  if (computed && computed.length >= 2) return computed;
  const preset = SI_SYM_PRESET_STOPS[ui.rampPreset] ?? SI_SYM_PRESET_STOPS[siAutoRampPresetForLayerName(layerId)];
  return preset.length >= 2 ? preset : null;
}
