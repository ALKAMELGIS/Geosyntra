import type { SiMapCameraSnapshot } from './siMapProjectionTerrain';

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

export type SiMapWeatherPreset = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'sunSky';

/** @deprecated Daylight tab removed — always weather. Kept for persisted slide/settings compatibility. */
export type SiMapWeatherPanelTab = 'weather';

export type SiMapWeatherPanelTheme = 'dark' | 'light';

export type SiMapWeatherSettings = {
  /** Panel focus — which preset controls are shown (does not stop other active presets). */
  preset: SiMapWeatherPreset;
  /** Presets currently driving map effects until manually turned off. */
  activePresets: SiMapWeatherPreset[];
  /** 0–100 — cloud layer density (all presets; strongest on cloudy). */
  cloudCover: number;
  /** 0–100 — rain / snow particle intensity. */
  precipitation: number;
  /** Whiten 3D terrain / buildings when snow is active. */
  snowCover: boolean;
  /** 0–100 — atmospheric fog thickness. */
  fogDensity: number;
  /** Minutes since midnight 0–1439 (map sun when sunPositionByDateTime is on). */
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
};

export const DEFAULT_SI_MAP_WEATHER: SiMapWeatherSettings = {
  preset: 'sunny',
  activePresets: ['sunny'],
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
  { id: 'sunSky', label: 'Sun & Sky', icon: 'fa-solar-panel' },
];

export function isSiMapSunSkyWeatherPreset(preset: SiMapWeatherPreset): boolean {
  return preset === 'sunSky';
}

/** True when the user selected the Weather panel “Fog” tool (not camera-tilt auto fog). */
export function isSiMapFogToolActive(s: SiMapWeatherSettings): boolean {
  const active = Array.isArray(s.activePresets) ? s.activePresets : [s.preset];
  return active.includes('fog') || s.fogDensity > 8;
}

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
  const activePresetsRaw = Array.isArray(o.activePresets) ? o.activePresets : null;
  const activePresets: SiMapWeatherPreset[] = activePresetsRaw
    ? activePresetsRaw
        .map(v => (v === 'flood' ? 'rain' : v))
        .filter((v): v is SiMapWeatherPreset =>
          SI_MAP_WEATHER_PRESETS.some(p => p.id === v),
        )
    : [preset];
  const panelTab: SiMapWeatherPanelTab = 'weather';
  const panelTheme = o.panelTheme === 'light' ? 'light' : 'dark';
  return {
    preset,
    activePresets: activePresets.length > 0 ? [...new Set(activePresets)] : [preset],
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
  };
}

export function siMapWeatherSettingsSignature(s: SiMapWeatherSettings): string {
  const active = Array.isArray(s.activePresets) ? [...s.activePresets].sort().join('+') : s.preset;
  return [
    active,
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
    s.panelTheme,
  ].join(':');
}
