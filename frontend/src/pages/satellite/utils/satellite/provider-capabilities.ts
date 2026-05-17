/** Satellite imagery provider catalog — single source for layers, indices, and capabilities. */

export type SatelliteProviderId =
  | 'sentinel-hub'
  | 'planet-labs'
  | 'maxar'
  | 'landsat'
  | 'copernicus'
  | 'airbus'
  | 'blacksky'
  | 'iceye'
  | 'capella'
  | 'umbra'
  | 'earthdaily'
  | 'satellogic';

export type SatelliteProviderCollection = {
  id: string;
  label: string;
  description?: string;
};

export type SatelliteProviderLayerCatalogEntry = {
  /** Stable catalog id (provider-scoped). */
  catalogId: string;
  label: string;
  /** Keywords to match Sentinel Hub WMS layer `name` when bridging non-SH providers. */
  wmsKeywords: string[];
  /** Optional environmental index id for charts / symbology. */
  indexHint?: string;
};

export type SatelliteProviderDefinition = {
  id: SatelliteProviderId;
  name: string;
  icon: string;
  resolutionLabel: string;
  dataType: string;
  revisitLabel: string;
  supportedLayers: SatelliteProviderLayerCatalogEntry[];
  supportedIndices: string[];
  resolutions: number[];
  supportsTimeSeries: boolean;
  supportsAnalytics: boolean;
  supportsWmsLive: boolean;
  collections?: SatelliteProviderCollection[];
  colorProfile?: string;
};

const L = (catalogId: string, label: string, wmsKeywords: string[], indexHint?: string) => ({
  catalogId,
  label,
  wmsKeywords,
  indexHint,
});

export const SATELLITE_PROVIDERS: readonly SatelliteProviderDefinition[] = [
  {
    id: 'sentinel-hub',
    name: 'Sentinel Hub',
    icon: '🛰',
    resolutionLabel: '10 m',
    dataType: 'MultiSpectral',
    revisitLabel: '5 days',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: true,
    colorProfile: 'sentinel',
    supportedIndices: ['NDVI', 'NDWI', 'EVI', 'SAVI', 'GNDVI', 'NDMI', 'True Color', 'False Color'],
    resolutions: [10],
    collections: [
      { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A' },
      { id: 'sentinel-1-grd', label: 'Sentinel-1 GRD' },
    ],
    supportedLayers: [
      L('ndvi', 'NDVI', ['NDVI']),
      L('ndwi', 'NDWI', ['NDWI', 'MNDWI', 'WATER']),
      L('evi', 'EVI', ['EVI']),
      L('savi', 'SAVI', ['SAVI']),
      L('true-color', 'True Color', ['TRUE', 'NATURAL', 'RGB']),
      L('false-color', 'False Color', ['FALSE', 'COLOR_INFRARED', 'FCIR']),
      L('moisture', 'Moisture Index', ['NDMI', 'MOISTURE']),
      L('agriculture', 'Agriculture', ['GNDVI', 'AGRICULTURE', 'CROP']),
    ],
  },
  {
    id: 'planet-labs',
    name: 'Planet Labs',
    icon: '🛰',
    resolutionLabel: '3 m',
    dataType: 'Daily Monitoring',
    revisitLabel: 'Daily',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    colorProfile: 'planet',
    supportedIndices: ['NDVI', 'Visual', 'Analytic', 'Surface Reflectance'],
    resolutions: [3],
    collections: [{ id: 'planetscope', label: 'PlanetScope' }, { id: 'skysat', label: 'SkySat' }],
    supportedLayers: [
      L('ps-visual', 'PlanetScope Visual', ['TRUE', 'NATURAL', 'RGB', 'VISUAL']),
      L('ps-analytic', 'PlanetScope Analytic', ['ANALYTIC', 'REFLECTANCE']),
      L('surface-reflectance', 'Surface Reflectance', ['REFLECTANCE', 'SR']),
      L('ndvi', 'NDVI', ['NDVI']),
      L('udm2', 'UDM2 Masks', ['MASK', 'UDM', 'CLOUD']),
    ],
  },
  {
    id: 'maxar',
    name: 'Maxar',
    icon: '🛰',
    resolutionLabel: '30 cm',
    dataType: 'Ultra High Resolution',
    revisitLabel: '1–3 days',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    supportedIndices: ['RGB', 'Pan', 'SWIR', 'Urban'],
    resolutions: [0.3, 0.5],
    supportedLayers: [
      L('wv-rgb', 'WorldView RGB', ['TRUE', 'RGB', 'NATURAL']),
      L('pan-sharp', 'Pan Sharpened', ['PAN', 'SHARP']),
      L('swir', 'SWIR', ['SWIR', 'B12']),
      L('urban', 'Urban Index', ['NDBI', 'URBAN', 'BUILT']),
      L('hr-true', 'High Resolution True Color', ['TRUE', 'WORLDVIEW']),
    ],
  },
  {
    id: 'landsat',
    name: 'Landsat',
    icon: '🛰',
    resolutionLabel: '30 m',
    dataType: 'Multispectral',
    revisitLabel: '16 days',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    supportedIndices: ['NDVI', 'NDWI', 'False Color'],
    resolutions: [30],
    collections: [{ id: 'landsat-c2-l2', label: 'Collection 2 L2' }],
    supportedLayers: [
      L('ndvi', 'NDVI', ['NDVI']),
      L('ndwi', 'NDWI', ['NDWI']),
      L('false-color', 'False Color', ['FALSE']),
      L('true-color', 'True Color', ['TRUE', 'RGB']),
    ],
  },
  {
    id: 'copernicus',
    name: 'Copernicus',
    icon: '🛰',
    resolutionLabel: '10 m',
    dataType: 'Open Data',
    revisitLabel: '5 days',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    supportedIndices: ['NDVI', 'NDWI', 'EVI'],
    resolutions: [10, 20],
    supportedLayers: [
      L('ndvi', 'NDVI', ['NDVI']),
      L('ndwi', 'NDWI', ['NDWI']),
      L('evi', 'EVI', ['EVI']),
      L('true-color', 'True Color', ['TRUE', 'RGB']),
    ],
  },
  {
    id: 'airbus',
    name: 'Airbus',
    icon: '🛰',
    resolutionLabel: '0.5 m',
    dataType: 'Optical / SAR',
    revisitLabel: 'Daily',
    supportsTimeSeries: true,
    supportsAnalytics: false,
    supportsWmsLive: false,
    supportedIndices: ['RGB', 'Pleiades', 'SPOT'],
    resolutions: [0.5, 1.5],
    supportedLayers: [
      L('pleiades-rgb', 'Pleiades RGB', ['TRUE', 'RGB']),
      L('spot', 'SPOT', ['SPOT']),
      L('ndvi', 'NDVI', ['NDVI']),
    ],
  },
  {
    id: 'blacksky',
    name: 'BlackSky',
    icon: '🛰',
    resolutionLabel: '1 m',
    dataType: 'High-frequency',
    revisitLabel: 'Intraday',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    supportedIndices: ['RGB', 'NDVI'],
    resolutions: [1],
    supportedLayers: [L('rgb', 'RGB', ['TRUE', 'RGB']), L('ndvi', 'NDVI', ['NDVI'])],
  },
  {
    id: 'iceye',
    name: 'ICEYE',
    icon: '🛰',
    resolutionLabel: '3 m',
    dataType: 'SAR',
    revisitLabel: 'Hours',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    supportedIndices: ['SAR', 'Amplitude'],
    resolutions: [3],
    supportedLayers: [L('sar', 'SAR Amplitude', ['SAR']), L('coherence', 'Coherence', ['COHERENCE'])],
  },
  {
    id: 'capella',
    name: 'Capella Space',
    icon: '🛰',
    resolutionLabel: '0.5 m',
    dataType: 'SAR',
    revisitLabel: 'Hours',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    supportedIndices: ['SAR'],
    resolutions: [0.5],
    supportedLayers: [L('sar', 'SAR Spotlight', ['SAR']), L('vv', 'VV Polarization', ['VV'])],
  },
  {
    id: 'umbra',
    name: 'Umbra',
    icon: '🛰',
    resolutionLabel: '0.25 m',
    dataType: 'SAR',
    revisitLabel: 'Hours',
    supportsTimeSeries: true,
    supportsAnalytics: false,
    supportsWmsLive: false,
    supportedIndices: ['SAR'],
    resolutions: [0.25],
    supportedLayers: [L('sar', 'SAR High-res', ['SAR'])],
  },
  {
    id: 'earthdaily',
    name: 'EarthDaily',
    icon: '🛰',
    resolutionLabel: '5 m',
    dataType: 'Daily Analytics',
    revisitLabel: 'Daily',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    supportedIndices: ['NDVI', 'NDWI'],
    resolutions: [5],
    supportedLayers: [L('ndvi', 'NDVI', ['NDVI']), L('ndwi', 'NDWI', ['NDWI'])],
  },
  {
    id: 'satellogic',
    name: 'Satellogic',
    icon: '🛰',
    resolutionLabel: '1 m',
    dataType: 'Multispectral',
    revisitLabel: 'Daily',
    supportsTimeSeries: true,
    supportsAnalytics: true,
    supportsWmsLive: false,
    supportedIndices: ['NDVI', 'RGB'],
    resolutions: [1],
    supportedLayers: [L('ndvi', 'NDVI', ['NDVI']), L('rgb', 'RGB', ['TRUE', 'RGB'])],
  },
] as const;

const PROVIDER_BY_ID = new Map(SATELLITE_PROVIDERS.map(p => [p.id, p]));

export function getSatelliteProvider(id: SatelliteProviderId): SatelliteProviderDefinition {
  return PROVIDER_BY_ID.get(id) ?? PROVIDER_BY_ID.get('sentinel-hub')!;
}

export function isSentinelHubProvider(id: SatelliteProviderId): boolean {
  return id === 'sentinel-hub';
}
