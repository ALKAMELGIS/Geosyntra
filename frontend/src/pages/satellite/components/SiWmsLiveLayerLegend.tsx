import { useMemo } from 'react';
import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import { mergeSymbologyUi, type SiWmsSymbologyUiState } from '../utils/siWmsSymbologyModel';
import { siWmsResolveCanonicalStops } from '../utils/siWmsSpectralClassification';
import {
  clearSpectralLegendDockOffset,
  type SiWmsSpectralLegendContext,
} from './SiWmsIndexClassificationLegend';
import { SiWmsUnifiedIndexLegend } from './SiWmsUnifiedIndexLegend';

export const SI_WMS_LIVE_LEGEND_OFFSET_LS = 'si-wms-live-legend-offset-v4';

export function clearLiveLegendDockOffset(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SI_WMS_LIVE_LEGEND_OFFSET_LS);
    localStorage.removeItem('si-wms-live-legend-offset-v2');
    localStorage.removeItem('si-wms-live-legend-offset-v1');
  } catch {
    /* ignore */
  }
  clearSpectralLegendDockOffset();
}

export type SiWmsLiveLayerLegendProps = {
  profile: WmsAoiEvalProfile;
  layerId: string;
  layerLabel: string;
  context: SiWmsSpectralLegendContext;
  symbologyUi: SiWmsSymbologyUiState;
  symbologyPartial?: Partial<SiWmsSymbologyUiState>;
};

export function SiWmsLiveLayerLegend({
  profile,
  layerId,
  layerLabel,
  context,
  symbologyUi,
  symbologyPartial,
}: SiWmsLiveLayerLegendProps) {
  const ui = useMemo(() => mergeSymbologyUi(symbologyUi), [symbologyUi]);
  const stops = useMemo(
    () => siWmsResolveCanonicalStops(layerId, symbologyPartial),
    [layerId, symbologyPartial],
  );
  const customSymbology =
    symbologyPartial != null &&
    Object.keys(symbologyPartial).length > 0 &&
    (symbologyPartial.rampPreset != null ||
      symbologyPartial.classificationType != null ||
      symbologyPartial.numClasses != null ||
      symbologyPartial.autoScientific === false);

  const isComposite =
    profile === 'true_color' || profile === 'false_color' || profile === 'swir' || profile === 'generic_rgb';

  return (
    <SiWmsUnifiedIndexLegend
      mode="live"
      profile={profile}
      layerLabel={layerLabel}
      context={context}
      classifiedStops={isComposite ? null : stops}
      customSymbology={customSymbology}
      offsetStorageKey={SI_WMS_LIVE_LEGEND_OFFSET_LS}
      ariaLabel="Live index layer legend"
    />
  );
}
