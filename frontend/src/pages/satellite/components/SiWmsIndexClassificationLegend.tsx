import { useMemo } from 'react';
import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import {
  SI_EVI_CLASSIFICATION_STOPS,
  SI_GNDVI_CLASSIFICATION_STOPS,
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  type IndexRampStop,
} from '../../../lib/siWmsIndexClassificationRamp';
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

const CLASSIFIED_PROFILES: readonly WmsAoiEvalProfile[] = [
  'ndvi',
  'ndwi',
  'gndvi',
  'ndmi',
  'evi',
  'savi',
  'ndbi',
  'lst',
];

export function siWmsShowsSpectralLegend(profile: WmsAoiEvalProfile): profile is Exclude<WmsAoiEvalProfile, 'native'> {
  return profile !== 'native';
}

function isClassifiedProfile(p: WmsAoiEvalProfile): p is (typeof CLASSIFIED_PROFILES)[number] {
  return (CLASSIFIED_PROFILES as readonly WmsAoiEvalProfile[]).includes(p);
}

function stopsForClassified(profile: (typeof CLASSIFIED_PROFILES)[number]): readonly IndexRampStop[] {
  switch (profile) {
    case 'ndvi':
      return SI_NDVI_CLASSIFICATION_STOPS;
    case 'ndwi':
      return SI_NDWI_CLASSIFICATION_STOPS;
    case 'gndvi':
      return SI_GNDVI_CLASSIFICATION_STOPS;
    case 'ndmi':
      return SI_NDMI_CLASSIFICATION_STOPS;
    case 'evi':
      return SI_EVI_CLASSIFICATION_STOPS;
    case 'savi':
      return SI_NDVI_CLASSIFICATION_STOPS;
    case 'ndbi':
      return SI_NDWI_CLASSIFICATION_STOPS;
    case 'lst':
      return SI_NDMI_CLASSIFICATION_STOPS;
    default:
      return SI_NDVI_CLASSIFICATION_STOPS;
  }
}

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
  profile: WmsAoiEvalProfile;
  layerLabel: string;
  context: SiWmsSpectralLegendContext;
  maxRows?: number;
  classifiedStopsOverride?: readonly IndexRampStop[] | null;
};

export function SiWmsIndexClassificationLegend({
  profile,
  layerLabel,
  context,
  maxRows,
  classifiedStopsOverride = null,
}: SiWmsIndexClassificationLegendProps) {
  const classifiedStops = useMemo(() => {
    if (isClassifiedProfile(profile)) {
      return classifiedStopsOverride && classifiedStopsOverride.length >= 2
        ? classifiedStopsOverride
        : stopsForClassified(profile);
    }
    return null;
  }, [profile, classifiedStopsOverride]);

  const customSymbology = Boolean(classifiedStopsOverride && classifiedStopsOverride.length >= 2);
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
      offsetStorageKey={SI_WMS_SPECTRAL_LEGEND_OFFSET_LS}
      ariaLabel="Spectral layer legend"
    />
  );
}
