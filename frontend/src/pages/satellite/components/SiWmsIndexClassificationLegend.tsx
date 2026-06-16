import { useMemo } from 'react';
import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import type { SiIndexClassAnalytics } from '../utils/siIndexClassAnalytics';
import { siWmsResolveCanonicalStops } from '../utils/siWmsSpectralClassification';
import type { SiWmsSymbologyUiState } from '../utils/siWmsSymbologyModel';
import { SiWmsUnifiedIndexLegend } from './SiWmsUnifiedIndexLegend';

export const SI_WMS_SPECTRAL_LEGEND_OFFSET_LS = 'si-wms-spectral-legend-offset-v4';

const SI_WMS_LEGEND_OFFSET_LS_LEGACY = [
  'si-wms-spectral-legend-offset-v3',
  'si-wms-spectral-legend-offset-v2',
  'si-wms-spectral-legend-offset-v1',
] as const;

/** Clear persisted drag offsets so the legend opens docked on the screen left edge. */
export function clearSpectralLegendDockOffset(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SI_WMS_SPECTRAL_LEGEND_OFFSET_LS);
    for (const key of SI_WMS_LEGEND_OFFSET_LS_LEGACY) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export { siWmsShowsSpectralLegend } from '../utils/siWmsLegendMode';

export type SiWmsSpectralTemporalSnapshot = {
  min: number;
  max: number;
  mean: number;
  weekStart: string;
  weekEnd: string;
};

export type SiWmsSpectralLegendContext = {
  imageryDateIso: string;
  seriesStartIso?: string | null;
  seriesEndIso?: string | null;
  timelinePlaying?: boolean;
  satelliteProviderName?: string | null;
  providerResolutionLabel?: string | null;
  temporal?: SiWmsSpectralTemporalSnapshot | null;
};

export type SiWmsIndexClassificationLegendProps = {
  layerId: string;
  profile: WmsAoiEvalProfile;
  layerLabel: string;
  context: SiWmsSpectralLegendContext;
  maxRows?: number;
  symbologyPartial?: Partial<SiWmsSymbologyUiState>;
  aoiFiniteValues?: readonly number[] | null;
  classifiedStopsOverride?: readonly IndexRampStop[] | null;
  classAnalytics?: SiIndexClassAnalytics | null;
  dataDrivenLabels?: boolean;
  stackIndex?: number;
  offsetStorageKey?: string;
};

export function SiWmsIndexClassificationLegend({
  layerId,
  profile,
  layerLabel,
  context,
  maxRows,
  symbologyPartial,
  aoiFiniteValues = null,
  classifiedStopsOverride = null,
  classAnalytics = null,
  dataDrivenLabels = false,
  stackIndex,
  offsetStorageKey = SI_WMS_SPECTRAL_LEGEND_OFFSET_LS,
}: SiWmsIndexClassificationLegendProps) {
  const classifiedStops = useMemo(() => {
    if (classifiedStopsOverride && classifiedStopsOverride.length >= 2) {
      return classifiedStopsOverride;
    }
    return siWmsResolveCanonicalStops(layerId, symbologyPartial, aoiFiniteValues);
  }, [layerId, symbologyPartial, aoiFiniteValues, classifiedStopsOverride]);

  const customSymbology = Boolean(
    symbologyPartial != null &&
      Object.keys(symbologyPartial).length > 0 &&
      symbologyPartial.autoScientific === false,
  );
  const isComposite =
    profile === 'true_color' || profile === 'false_color' || profile === 'swir' || profile === 'generic_rgb';

  return (
    <SiWmsUnifiedIndexLegend
      mode="scientific"
      profile={profile}
      layerLabel={layerLabel}
      context={context}
      classifiedStops={isComposite ? null : classifiedStops}
      maxRows={maxRows}
      customSymbology={customSymbology}
      offsetStorageKey={offsetStorageKey}
      ariaLabel="Spectral layer legend"
      classAnalytics={classAnalytics}
      stackIndex={stackIndex}
      dataDrivenLabels={dataDrivenLabels || Boolean(aoiFiniteValues?.length)}
    />
  );
}
