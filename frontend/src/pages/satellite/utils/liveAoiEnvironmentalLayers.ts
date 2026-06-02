import {
  sortStaticAoiChartLayerIds,
  type StaticAoiChartLayerId,
} from './staticAoiChartTypes';

/** Sentinel-2 optical indices sampled inside the AOI via analysis_engine MPC zonal API. */
export const MPC_ZONAL_ENVIRONMENTAL_LAYER_IDS: StaticAoiChartLayerId[] = [
  'NDVI',
  'NDMI',
  'NDWI',
  'SAVI',
  'EVI',
];

/** Default layers shown in live AOI panels (bars, mix %, spectral profile). */
export const LIVE_AOI_PANEL_LAYER_IDS: StaticAoiChartLayerId[] = [
  ...MPC_ZONAL_ENVIRONMENTAL_LAYER_IDS,
];

/** Full optical stack requested from analysis_engine (LST uses WMS timeline mean). */
export const LIVE_AOI_MPC_LAYER_IDS: StaticAoiChartLayerId[] = [
  'NDVI',
  'NDMI',
  'NDWI',
  'SAVI',
  'EVI',
  'NDBI',
  'GNDVI',
  'NDSI',
];

/** Human-readable labels for environmental / climate proxies derived from raster indices. */
export function liveAoiDisplayLabel(layerId: StaticAoiChartLayerId): string {
  switch (layerId) {
    case 'NDMI':
      return 'Soil moisture';
    case 'NDWI':
      return 'Humidity';
    case 'NDVI':
      return 'Vegetation (NDVI)';
    case 'SAVI':
      return 'Vegetation (SAVI)';
    case 'EVI':
      return 'Vegetation (EVI)';
    case 'LST':
      return 'Temperature';
    case 'NDSI':
      return 'Snow index';
    case 'NDBI':
      return 'Built-up';
    case 'GNDVI':
      return 'Green NDVI';
    default:
      return layerId;
  }
}

/** Layer ids sent to MPC (optical stack only — LST uses WMS timeline mean). */
export function mpcZonalApiLayerIdsFromPopup(ids: readonly StaticAoiChartLayerId[]): StaticAoiChartLayerId[] {
  return ids.filter(id => id !== 'LST');
}

export function buildLiveAoiPopupZonalLayerIds(
  comparisonLayers: readonly StaticAoiChartLayerId[],
  activeLayerId: StaticAoiChartLayerId,
): StaticAoiChartLayerId[] {
  const ids = new Set<StaticAoiChartLayerId>([
    ...LIVE_AOI_MPC_LAYER_IDS,
    ...LIVE_AOI_PANEL_LAYER_IDS,
    ...comparisonLayers,
    activeLayerId,
  ]);
  return sortStaticAoiChartLayerIds([...ids].filter(id => id !== 'LST'));
}

/** MPC zonal sampling for spectral analysis — active index layer only (no multi-index mixing). */
export function buildActiveSpectralSamplingLayerIds(
  activeLayerId: StaticAoiChartLayerId,
): StaticAoiChartLayerId[] {
  if (activeLayerId === 'LST') return [];
  return [activeLayerId];
}
