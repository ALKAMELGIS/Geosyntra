import { inferWmsEvalProfile, type WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { mergeSymbologyUi, type SiWmsSymbologyUiState } from './siWmsSymbologyModel';
import { siWmsResolveCanonicalStops } from './siWmsSpectralClassification';

export { mergeSymbologyUi } from './siWmsSymbologyModel';

export type SiWmsLegendDisplayMode = 'none' | 'live' | 'scientific';

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

export function isClassifiedWmsProfile(profile: WmsAoiEvalProfile): boolean {
  return CLASSIFIED_PROFILES.has(profile);
}

export function wmsProfileShowsLegend(profile: WmsAoiEvalProfile): boolean {
  return profile !== 'native';
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

/** Canonical 10-class stops — same as map WMS evalscript. */
export function siWmsLiveLegendStops(
  layerId: string,
  _ui: SiWmsSymbologyUiState,
  symbologyPartial?: Partial<SiWmsSymbologyUiState>,
): readonly IndexRampStop[] | null {
  return siWmsResolveCanonicalStops(layerId, symbologyPartial);
}
