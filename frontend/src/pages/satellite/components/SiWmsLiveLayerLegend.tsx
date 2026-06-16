import { useMemo } from 'react';
import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { mergeSymbologyUi, type SiWmsSymbologyUiState } from '../utils/siWmsSymbologyModel';
import type { SiIndexClassAnalytics } from '../utils/siIndexClassAnalytics';
import { siWmsResolveCanonicalStops, siWmsSpectralClassCountForLayer } from '../utils/siWmsSpectralClassification';
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
  aoiFiniteValues?: readonly number[] | null;
  classifiedStopsOverride?: readonly IndexRampStop[] | null;
  classAnalytics?: SiIndexClassAnalytics | null;
  dataDrivenLabels?: boolean;
  stackIndex?: number;
  offsetStorageKey?: string;
};

export function SiWmsLiveLayerLegend({
  profile,
  layerId,
  layerLabel,
  context,
  symbologyUi,
  symbologyPartial,
  aoiFiniteValues = null,
  classifiedStopsOverride = null,
  classAnalytics = null,
  dataDrivenLabels = false,
  stackIndex,
  offsetStorageKey = SI_WMS_LIVE_LEGEND_OFFSET_LS,
}: SiWmsLiveLayerLegendProps) {
  const ui = useMemo(() => mergeSymbologyUi(symbologyUi), [symbologyUi]);
  const stops = useMemo(() => {
    if (classifiedStopsOverride && classifiedStopsOverride.length >= 2) {
      return classifiedStopsOverride;
    }
    return siWmsResolveCanonicalStops(layerId, symbologyPartial, aoiFiniteValues);
  }, [layerId, symbologyPartial, aoiFiniteValues, classifiedStopsOverride]);
  const customSymbology =
    symbologyPartial != null &&
    Object.keys(symbologyPartial).length > 0 &&
    (symbologyPartial.rampPreset != null ||
      symbologyPartial.classificationType != null ||
      symbologyPartial.numClasses != null ||
      symbologyPartial.autoScientific === false);

  const isComposite =
    profile === 'true_color' || profile === 'false_color' || profile === 'swir' || profile === 'generic_rgb';

  const maxRows = siWmsSpectralClassCountForLayer(layerId);

  return (
    <SiWmsUnifiedIndexLegend
      mode="live"
      profile={profile}
      layerId={layerId}
      layerLabel={layerLabel}
      context={context}
      classifiedStops={isComposite ? null : stops}
      maxRows={maxRows}
      customSymbology={customSymbology}
      offsetStorageKey={offsetStorageKey}
      ariaLabel="Live index layer legend"
      classAnalytics={classAnalytics}
      stackIndex={stackIndex}
      dataDrivenLabels={dataDrivenLabels || Boolean(aoiFiniteValues?.length)}
    />
  );
}
