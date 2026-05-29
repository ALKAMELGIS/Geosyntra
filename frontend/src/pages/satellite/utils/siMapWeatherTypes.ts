import type { SiMapCameraSnapshot } from './siMapProjectionTerrain';
import type { SiRainFlowIntensity } from './siMapRainFlowTypes';

function siMapDaylightTodayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sanitizeDaylightDateIso(raw: unknown, fallback?: string): string {
  const fb = fallback ?? siMapDaylightTodayIso();
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return fb;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return fb;
  return raw.trim();
}

export type SiMapWeatherPreset = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'fog';

export type SiMapWeatherPanelTab = 'daylight' | 'weather';

export type SiMapWeatherPanelTheme = 'dark' | 'light';

export type SiMapWeatherSettings = {
  preset: SiMapWeatherPreset;
  /** 0–100 — cloud layer density (all presets; strongest on cloudy). */
  cloudCover: number;
  /** 0–100 — rain / snow particle intensity. */
  precipitation: number;
  /** Whiten 3D terrain / buildings when snow is active. */
  snowCover: boolean;
  /** 0–100 — atmospheric fog thickness. */
  fogDensity: number;
  /** Daylight tab: minutes since midnight 0–1439 (ArcGIS Scene slider). */
  daylightMinutes: number;
  /** ISO date (YYYY-MM-DD) for seasonal sun angle. */
  daylightDate: string;
  /** Drive map light + fog from date/time (ArcGIS-style). */
  sunPositionByDateTime: boolean;
  /** Mapbox cast-shadows on 3D buildings when supported. */
  daylightShadows: boolean;
  /** Animate time-of-day slider. */
  daylightTimePlaying: boolean;
  /** Animate calendar date (season). */
  daylightDatePlaying: boolean;
  panelTab: SiMapWeatherPanelTab;
  /** Panel chrome only — does not affect map weather rendering. */
  panelTheme: SiMapWeatherPanelTheme;
  /** Flood simulation (DEM, slope, flow accumulation) inside AOI. */
  rainFlowEnabled: boolean;
  rainFlowIntensity: SiRainFlowIntensity;
  rainFlowPlaying: boolean;
  /** 0–100 — share of rainfall lost to infiltration. */
  floodInfiltration: number;
  /** 0–100 — surface friction (slows overland flow). */
  floodRoughness: number;
  /** 0–100 — initial standing water before rainfall. */
  floodInitialWater: number;
  /** Hydrologic scenario length (hours) — scales runoff accumulation at build time. */
  floodDurationHours: number;
  /** Optional Mapbox point/heatmap debug overlays (off by default — use canvas streamflow). */
  floodAnalysisMapLayers: boolean;
  floodShowDepth: boolean;
  floodShowFlowDir: boolean;
  floodShowAccumulation: boolean;
  floodShowRisk: boolean;
  floodShowVelocity: boolean;
  /** DEM / routing grid resolution inside AOI. */
  floodCellResolution: 'coarse' | 'medium' | 'fine';
};

export const DEFAULT_SI_MAP_WEATHER: SiMapWeatherSettings = {
  preset: 'sunny',
  cloudCover: 35,
  precipitation: 55,
  snowCover: false,
  fogDensity: 40,
  daylightMinutes: 720,
  daylightDate: siMapDaylightTodayIso(),
  sunPositionByDateTime: true,
  daylightShadows: true,
  daylightTimePlaying: false,
  daylightDatePlaying: false,
  panelTab: 'weather',
  panelTheme: 'dark',
  rainFlowEnabled: false,
  rainFlowIntensity: 'medium',
  rainFlowPlaying: false,
  floodInfiltration: 25,
  floodRoughness: 20,
  floodInitialWater: 0,
  floodDurationHours: 6,
  floodAnalysisMapLayers: false,
  floodShowDepth: false,
  floodShowFlowDir: false,
  floodShowAccumulation: false,
  floodShowRisk: false,
  floodShowVelocity: false,
  floodCellResolution: 'medium',
};

export type SiMapSceneSlide = {
  id: string;
  title: string;
  createdAt: string;
  camera: SiMapCameraSnapshot;
  weather: SiMapWeatherSettings;
  basemapId?: string;
};

export const SI_MAP_WEATHER_PRESETS: {
  id: SiMapWeatherPreset;
  label: string;
  icon: string;
}[] = [
  { id: 'sunny', label: 'Sunny', icon: 'fa-sun' },
  { id: 'cloudy', label: 'Cloudy', icon: 'fa-cloud-sun' },
  { id: 'rain', label: 'Rain', icon: 'fa-cloud-rain' },
  { id: 'snow', label: 'Snow', icon: 'fa-snowflake' },
  { id: 'fog', label: 'Fog', icon: 'fa-smog' },
];

export function clampPct(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function sanitizeSiMapWeatherSettings(raw: unknown): SiMapWeatherSettings {
  const d = DEFAULT_SI_MAP_WEATHER;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  const rawPreset = o.preset === 'flood' ? 'rain' : o.preset;
  const preset = SI_MAP_WEATHER_PRESETS.some(p => p.id === rawPreset)
    ? (rawPreset as SiMapWeatherPreset)
    : d.preset;
  const panelTab = o.panelTab === 'daylight' ? 'daylight' : 'weather';
  const panelTheme = o.panelTheme === 'light' ? 'light' : 'dark';
  const rainFlowIntensity =
    o.rainFlowIntensity === 'low' || o.rainFlowIntensity === 'high' ? o.rainFlowIntensity : 'medium';
  return {
    preset,
    cloudCover: clampPct(o.cloudCover, d.cloudCover),
    precipitation: clampPct(o.precipitation, d.precipitation),
    snowCover: Boolean(o.snowCover),
    fogDensity: clampPct(o.fogDensity, d.fogDensity),
    daylightMinutes: (() => {
      if (o.daylightMinutes != null && Number.isFinite(Number(o.daylightMinutes))) {
        return Math.max(0, Math.min(1439, Math.round(Number(o.daylightMinutes))));
      }
      const legacyHour = Number(o.daylightHour);
      if (Number.isFinite(legacyHour)) {
        return Math.max(0, Math.min(1439, Math.round(legacyHour * 60)));
      }
      return d.daylightMinutes;
    })(),
    daylightDate: sanitizeDaylightDateIso(o.daylightDate, d.daylightDate),
    sunPositionByDateTime: o.sunPositionByDateTime !== false,
    daylightShadows: o.daylightShadows != null ? Boolean(o.daylightShadows) : d.daylightShadows,
    daylightTimePlaying: Boolean(o.daylightTimePlaying),
    daylightDatePlaying: Boolean(o.daylightDatePlaying),
    panelTab,
    panelTheme,
    rainFlowEnabled: false,
    rainFlowIntensity,
    rainFlowPlaying: false,
    floodInfiltration: clampPct(o.floodInfiltration, d.floodInfiltration),
    floodRoughness: clampPct(o.floodRoughness, d.floodRoughness),
    floodInitialWater: clampPct(o.floodInitialWater, d.floodInitialWater),
    floodDurationHours: Math.max(1, Math.min(72, Math.round(Number(o.floodDurationHours) || d.floodDurationHours))),
    floodAnalysisMapLayers: Boolean(o.floodAnalysisMapLayers),
    floodShowDepth: Boolean(o.floodShowDepth),
    floodShowFlowDir: Boolean(o.floodShowFlowDir),
    floodShowAccumulation: Boolean(o.floodShowAccumulation),
    floodShowRisk: Boolean(o.floodShowRisk),
    floodShowVelocity: Boolean(o.floodShowVelocity),
    floodCellResolution:
      o.floodCellResolution === 'coarse' || o.floodCellResolution === 'fine'
        ? o.floodCellResolution
        : d.floodCellResolution,
  };
}

export function siMapWeatherSettingsSignature(s: SiMapWeatherSettings): string {
  return [
    s.preset,
    s.cloudCover,
    s.precipitation,
    s.snowCover ? '1' : '0',
    s.fogDensity,
    String(s.daylightMinutes),
    s.daylightDate,
    s.sunPositionByDateTime ? '1' : '0',
    s.daylightShadows ? '1' : '0',
    s.daylightTimePlaying ? '1' : '0',
    s.daylightDatePlaying ? '1' : '0',
    s.panelTab,
    s.rainFlowEnabled ? '1' : '0',
    s.rainFlowIntensity,
    s.rainFlowPlaying ? '1' : '0',
    s.floodInfiltration,
    s.floodRoughness,
    s.floodInitialWater,
    String(s.floodDurationHours),
    s.floodAnalysisMapLayers ? '1' : '0',
    s.floodShowDepth ? '1' : '0',
    s.floodShowFlowDir ? '1' : '0',
    s.floodShowAccumulation ? '1' : '0',
    s.floodShowRisk ? '1' : '0',
    s.floodShowVelocity ? '1' : '0',
    s.floodCellResolution,
  ].join(':');
}
