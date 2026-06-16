export type SiExploreIndexTab = 'all' | 'agriculture' | 'forestry' | 'custom';

export type SiExploreIndexBand = {
  id: string;
  title: string;
  description: string;
  tabs: readonly SiExploreIndexTab[];
  /** Keywords to match Sentinel Hub / Layer Live option id or label. */
  matchTerms: readonly string[];
};

export const SI_EXPLORE_INDEX_TABS: ReadonlyArray<{ id: SiExploreIndexTab; label: string }> = [
  { id: 'all', label: 'All layers' },
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'forestry', label: 'Forestry' },
  { id: 'custom', label: 'Custom' },
];

export const SI_EXPLORE_INDEX_BANDS: readonly SiExploreIndexBand[] = [
  {
    id: 'ndvi',
    title: 'NDVI',
    description: 'Shows vegetation health and cover',
    tabs: ['all', 'agriculture'],
    matchTerms: ['NDVI'],
  },
  {
    id: 'color-infrared',
    title: 'Color Infrared (Vegetation)',
    description: 'Highlights vegetation condition',
    tabs: ['all', 'agriculture'],
    matchTerms: ['COLOR_INFRARED', 'COLOR INFRARED', 'CIR', 'FALSE_COLOR'],
  },
  {
    id: 'agriculture',
    title: 'Agriculture',
    description: 'Best for crop lifecycle monitoring',
    tabs: ['all', 'agriculture'],
    matchTerms: ['AGRICULTURE', 'CROP'],
  },
  {
    id: 'land-water',
    title: 'Land/Water',
    description: 'Detects water bodies and floods',
    tabs: ['all'],
    matchTerms: ['LAND_WATER', 'LAND-WATER', 'LAND WATER', 'MNDWI', 'NDWI'],
  },
  {
    id: 'vegetation-analysis',
    title: 'Vegetation Analysis',
    description: 'Tracks vegetation density and stress',
    tabs: ['all', 'agriculture'],
    matchTerms: ['VEGETATION', 'VEG_ANALYSIS', 'GNDVI'],
  },
  {
    id: 'healthy-vegetation',
    title: 'Healthy Vegetation',
    description: 'Crop growth monitoring',
    tabs: ['all', 'agriculture'],
    matchTerms: ['HEALTHY_VEGETATION', 'HEALTHY VEGETATION', 'VHS'],
  },
  {
    id: 'forestry-coverage',
    title: 'Forestry Coverage Band',
    description: 'Forest extent reference layer',
    tabs: ['all', 'forestry'],
    matchTerms: ['FORESTRY', 'FOREST'],
  },
  {
    id: 'ndwi',
    title: 'NDWI',
    description: 'Water detection index',
    tabs: ['all', 'agriculture'],
    matchTerms: ['NDWI'],
  },
  {
    id: 'savi',
    title: 'SAVI',
    description: 'Bare/dry soil vegetation index',
    tabs: ['all', 'agriculture'],
    matchTerms: ['SAVI'],
  },
  {
    id: 'arvi',
    title: 'ARVI',
    description: 'Works in dusty or hazy conditions',
    tabs: ['all', 'agriculture'],
    matchTerms: ['ARVI'],
  },
  {
    id: 'swir',
    title: 'Shortwave Infrared',
    description: 'Moisture and dryness detection',
    tabs: ['all'],
    matchTerms: ['SWIR', 'SHORTWAVE'],
  },
  {
    id: 'false-color-urban',
    title: 'False Color (Urban)',
    description: 'Urban area visualization',
    tabs: ['all', 'custom'],
    matchTerms: ['FALSE_COLOR_URBAN', 'URBAN', 'NDBI'],
  },
  {
    id: 'ndvi-classic',
    title: 'NDVI Classic',
    description: 'Standard vegetation index',
    tabs: ['all', 'agriculture'],
    matchTerms: ['NDVI_CLASSIC', 'NDVI'],
  },
  {
    id: 'nbr',
    title: 'NBR',
    description: 'Burned area detection',
    tabs: ['all', 'forestry'],
    matchTerms: ['NBR', 'BURN'],
  },
  {
    id: 'evi',
    title: 'EVI',
    description: 'Dense vegetation monitoring',
    tabs: ['all', 'agriculture'],
    matchTerms: ['EVI'],
  },
  {
    id: 'gci',
    title: 'GCI',
    description: 'Nutrient stress detection',
    tabs: ['all', 'agriculture'],
    matchTerms: ['GCI', 'CHLOROPHYLL'],
  },
  {
    id: 'sipi',
    title: 'SIPI',
    description: 'Pigment stress detection',
    tabs: ['all', 'agriculture'],
    matchTerms: ['SIPI'],
  },
  {
    id: 'index-stack',
    title: 'Index Stack',
    description: 'Multi-index soil moisture anomaly view',
    tabs: ['all', 'custom'],
    matchTerms: ['INDEX_STACK', 'STACK', 'NDMI'],
  },
  {
    id: 'ndsi',
    title: 'NDSI',
    description: 'Snow vs cloud separation',
    tabs: ['all', 'custom'],
    matchTerms: ['NDSI', 'SNOW'],
  },
  {
    id: 'scene-classification',
    title: 'Scene Classification',
    description: 'Automatically labels land, water, clouds',
    tabs: ['all', 'custom'],
    matchTerms: ['SCENE_CLASSIFICATION', 'SCL', 'CLASSIFICATION'],
  },
  {
    id: 'fire-detection',
    title: 'Fire Detection Index',
    description: 'Detects active fires and hotspots',
    tabs: ['all', 'custom', 'forestry'],
    matchTerms: ['FIRE', 'HOTSPOT', 'FIRMS'],
  },
  {
    id: 'deforestation',
    title: 'Deforestation Index',
    description: 'Detects forest loss',
    tabs: ['all', 'forestry'],
    matchTerms: ['DEFORESTATION', 'FOREST_LOSS', 'VDG'],
  },
  {
    id: 'atmospheric-penetration',
    title: 'Atmospheric Penetration',
    description: 'Improves visibility through haze and smoke',
    tabs: ['all', 'custom'],
    matchTerms: ['ATMOSPHERIC_PENETRATION', 'HAZE', 'PENETRATION'],
  },
  {
    id: 'atmospheric-removal',
    title: 'Atmospheric Removal',
    description: 'Clears atmospheric effects',
    tabs: ['all', 'custom'],
    matchTerms: ['ATMOSPHERIC_REMOVAL', 'AOT', 'ATMOSPHERIC'],
  },
  {
    id: 'snow-clouds',
    title: 'Snow/Clouds',
    description: 'Snow and cloud classification',
    tabs: ['all', 'custom'],
    matchTerms: ['SNOW', 'CLOUD', 'SCL'],
  },
];

export function filterSiExploreIndexBands(
  tab: SiExploreIndexTab,
  bands: readonly SiExploreIndexBand[] = SI_EXPLORE_INDEX_BANDS,
): SiExploreIndexBand[] {
  if (tab === 'all') return [...bands];
  return bands.filter(b => b.tabs.includes(tab));
}
