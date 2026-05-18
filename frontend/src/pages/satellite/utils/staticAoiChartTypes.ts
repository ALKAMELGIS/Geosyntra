export type WeeklyCompositeLite = {
  weekIndex: number;
  startDate: string;
  endDate: string;
  mean: number;
};

export type StaticAoiChartLayerId =
  | 'NDVI'
  | 'NDWI'
  | 'NDMI'
  | 'EVI'
  | 'SAVI'
  | 'NDSI'
  | 'NDBI'
  | 'GNDVI'
  | 'LST';

export const STATIC_AOI_CHART_LAYER_OPTIONS: Array<{
  id: StaticAoiChartLayerId;
  label: string;
  subtitle: string;
  range: [number, number];
}> = [
  { id: 'NDVI', label: 'NDVI', subtitle: 'Vegetation (NIR / red)', range: [-1, 1] },
  { id: 'NDWI', label: 'NDWI', subtitle: 'Water / moisture (green–NIR)', range: [-1, 1] },
  { id: 'NDMI', label: 'NDMI', subtitle: 'Soil / canopy moisture (NIR–SWIR)', range: [-1, 1] },
  { id: 'SAVI', label: 'SAVI', subtitle: 'Soil-adjusted vegetation', range: [-1, 1] },
  { id: 'EVI', label: 'EVI', subtitle: 'Enhanced vegetation', range: [-1, 1] },
  { id: 'NDSI', label: 'NDSI', subtitle: 'Snow / bright surfaces', range: [-1, 1] },
  { id: 'NDBI', label: 'NDBI', subtitle: 'Built-up / bare soil (SWIR–NIR)', range: [-1, 1] },
  { id: 'GNDVI', label: 'GNDVI', subtitle: 'Green NDVI (NIR–green)', range: [-1, 1] },
  { id: 'LST', label: 'LST', subtitle: 'Land surface temperature (°C)', range: [15, 45] },
];

export const STATIC_AOI_CHART_LAYER_INLINE_IDS: StaticAoiChartLayerId[] = [
  'NDVI',
  'NDWI',
  'NDMI',
  'SAVI',
  'EVI',
  'LST',
];

export function defaultStaticAoiComparisonLayers(): StaticAoiChartLayerId[] {
  return ['NDVI', 'NDWI', 'EVI'];
}

export function sortStaticAoiChartLayerIds(ids: StaticAoiChartLayerId[]): StaticAoiChartLayerId[] {
  const order = STATIC_AOI_CHART_LAYER_OPTIONS.map(o => o.id);
  return [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Stable AOI fingerprint for charts / zonal stats (pure — no hook ordering hazards). */
export function getStaticAoiChartAoiKey(drawnGeometry: unknown): string | null {
  if (!drawnGeometry) return null;
  try {
    return JSON.stringify(drawnGeometry);
  } catch {
    return 'aoi';
  }
}
