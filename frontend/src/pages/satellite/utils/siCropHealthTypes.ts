import type { StaticAoiChartLayerId, WeeklyCompositeLite } from './staticAoiChartTypes';
import type {
  SiCropHealthSeverityLayers,
  SiCropHealthStressRaster,
} from './siCropHealthRasterHeatmap';

export type SiCropHealthCondition =
  | 'healthy'
  | 'stress'
  | 'early_disease'
  | 'disease_active';

export type SiCropHealthSeverity = 'low' | 'medium' | 'high';

export type SiCropTypeId =
  | 'wheat'
  | 'corn'
  | 'rice'
  | 'cotton'
  | 'alfalfa'
  | 'vegetables'
  | 'generic';

export const SI_CROP_TYPE_OPTIONS: { id: SiCropTypeId; label: string }[] = [
  { id: 'wheat', label: 'Wheat' },
  { id: 'corn', label: 'Corn / Maize' },
  { id: 'rice', label: 'Rice' },
  { id: 'cotton', label: 'Cotton' },
  { id: 'alfalfa', label: 'Alfalfa' },
  { id: 'vegetables', label: 'Vegetables' },
  { id: 'generic', label: 'Generic crop' },
];

export const SI_CROP_HEALTH_CONDITION_META: Record<
  SiCropHealthCondition,
  { label: string; color: string; description: string }
> = {
  healthy: { label: 'Healthy', color: '#22c55e', description: 'Normal vigor and stable canopy' },
  stress: { label: 'Stress', color: '#eab308', description: 'Vegetation stress — monitor closely' },
  early_disease: {
    label: 'Early disease',
    color: '#f97316',
    description: 'Early anomaly signature — scout recommended',
  },
  disease_active: {
    label: 'Disease active',
    color: '#ef4444',
    description: 'High-risk zone — intervention likely needed',
  },
};

export const SI_CROP_HEALTH_SEVERITY_COLORS: Record<SiCropHealthSeverity, string> = {
  low: 'rgba(34, 197, 94, 0.55)',
  medium: 'rgba(234, 179, 8, 0.62)',
  high: 'rgba(239, 68, 68, 0.72)',
};

/** STAC collection for MPC zonal sampling (Sentinel-2, Landsat, etc.). */
export const SI_CROP_HEALTH_SATELLITE_OPTIONS: { id: string; label: string }[] = [
  { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A (default)' },
  { id: 'landsat-c2-l2', label: 'Landsat 8/9 C2 L2' },
];

export type SiCropHealthSettings = {
  aoiId: string;
  cropType: SiCropTypeId;
  /** STAC collection id passed to analysis_engine zonal sampling. */
  satelliteCollection: string;
  ndviAnalysisEnabled: boolean;
  aiDiseaseEnabled: boolean;
  useWeatherApi: boolean;
  useSoilMoistureIndex: boolean;
  /** Manual weather overrides when API off or as supplement (0–100). */
  temperatureC: number;
  humidityPct: number;
  rainfallMmWeek: number;
  soilMoisturePct: number;
  showHealthLayer: boolean;
  showDiseaseRiskLayer: boolean;
  showHotspots: boolean;
  /** Continuous spectral stress raster (Mapbox image source). */
  showStressRaster: boolean;
  /** Classified low / medium / high stress polygons. */
  showSeverityLayers: boolean;
  healthOpacity: number;
};

export const DEFAULT_SI_CROP_HEALTH_SETTINGS: SiCropHealthSettings = {
  aoiId: '',
  cropType: 'generic',
  satelliteCollection: 'sentinel-2-l2a',
  ndviAnalysisEnabled: true,
  aiDiseaseEnabled: true,
  useWeatherApi: true,
  useSoilMoistureIndex: true,
  temperatureC: 28,
  humidityPct: 55,
  rainfallMmWeek: 12,
  soilMoisturePct: 45,
  showHealthLayer: true,
  showDiseaseRiskLayer: true,
  showHotspots: true,
  showStressRaster: true,
  showSeverityLayers: true,
  healthOpacity: 0.72,
};

export type SiCropHealthCell = {
  lng: number;
  lat: number;
  ndvi: number;
  evi: number;
  savi: number;
  ndmi?: number;
  ndviDelta: number;
  score: number;
  stressIndex: number;
  condition: SiCropHealthCondition;
  severity: SiCropHealthSeverity;
};

export type SiCropHealthEnvironmentalSnapshot = {
  ndviMean: number;
  ndmiMean: number | null;
  temperatureC: number;
  soilMoisturePct: number;
  humidityPct: number;
  dataSource: 'mpc' | 'synthetic' | 'cache';
};

export type SiCropHealthHotspot = {
  id: string;
  lng: number;
  lat: number;
  radiusM: number;
  condition: SiCropHealthCondition;
  severity: SiCropHealthSeverity;
  pixelCount: number;
  meanNdvi: number;
};

export type SiCropHealthTrendPoint = {
  weekEndIso: string;
  meanNdvi: number;
  stressPct: number;
  diseasePct: number;
};

export type SiCropHealthAnalysisResult = {
  analyzedAtIso: string;
  aoiId: string;
  aoiName: string;
  cropType: SiCropTypeId;
  areaHa: number;
  cellCount: number;
  modelLabel: string;
  ndviMean: number;
  ndviDeltaWeek: number;
  weatherStress: number;
  summary: Record<SiCropHealthCondition, { count: number; pct: number; areaHa: number }>;
  cells: SiCropHealthCell[];
  hotspots: SiCropHealthHotspot[];
  trend: SiCropHealthTrendPoint[];
  indicesUsed: StaticAoiChartLayerId[];
  environmental: SiCropHealthEnvironmentalSnapshot;
  stressRaster: SiCropHealthStressRaster | null;
  severityLayers: SiCropHealthSeverityLayers;
};

export type SiCropHealthWeatherContext = {
  temperatureC: number;
  humidityPct: number;
  rainfallMmWeek: number;
  soilMoisturePct: number;
  source: 'api' | 'manual';
};

export type RunSiCropHealthAnalysisInput = {
  cropType: SiCropTypeId;
  ndviAnalysisEnabled: boolean;
  aiDiseaseEnabled: boolean;
  useSoilMoistureIndex?: boolean;
  weather: SiCropHealthWeatherContext;
  weeklyComposites: readonly WeeklyCompositeLite[];
  anchorDateIso: string;
};
