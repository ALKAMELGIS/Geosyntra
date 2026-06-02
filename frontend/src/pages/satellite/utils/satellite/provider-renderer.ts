import { getSatelliteProvider, type SatelliteProviderId } from './provider-capabilities';

export type ProviderRendererProfile = {
  providerId: SatelliteProviderId;
  providerName: string;
  resolutionM: number;
  supportsTimeSeries: boolean;
  supportsAnalytics: boolean;
  supportsWmsLive: boolean;
  colorProfile: string;
  cacheKeyPrefix: string;
  /** Hint for symbology / classification preset routing. */
  spectralPresetFamily: 'vegetation' | 'water' | 'thermal' | 'soil' | 'sar' | 'mixed';
};

export function buildProviderRendererProfile(providerId: SatelliteProviderId): ProviderRendererProfile {
  const p = getSatelliteProvider(providerId);
  const resolutionM = p.resolutions[0] ?? 10;
  let spectralPresetFamily: ProviderRendererProfile['spectralPresetFamily'] = 'mixed';
  if (providerId === 'sentinel-hub' || providerId === 'copernicus' || providerId === 'landsat') {
    spectralPresetFamily = 'vegetation';
  } else if (providerId === 'planet-labs') {
    spectralPresetFamily = 'vegetation';
  } else if (providerId === 'maxar' || providerId === 'airbus') {
    spectralPresetFamily = 'mixed';
  } else if (providerId === 'iceye' || providerId === 'capella' || providerId === 'umbra') {
    spectralPresetFamily = 'sar';
  }

  return {
    providerId,
    providerName: p.name,
    resolutionM,
    supportsTimeSeries: p.supportsTimeSeries,
    supportsAnalytics: p.supportsAnalytics,
    supportsWmsLive: p.supportsWmsLive,
    colorProfile: p.colorProfile ?? providerId,
    cacheKeyPrefix: `si-prov-${providerId}`,
    spectralPresetFamily,
  };
}

/** Cache key segment for WMS / timeline invalidation on provider change. */
export function providerCacheEpochKey(providerId: SatelliteProviderId, epoch: number): string {
  return `${providerId}@${epoch}`;
}
