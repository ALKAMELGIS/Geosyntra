import {
  DEFAULT_SI_MAP_WEATHER,
  sanitizeSiMapWeatherSettings,
  type SiMapWeatherSettings,
} from './siMapWeatherTypes';

const LS_KEY = 'si-map-weather-settings-v3';
const LS_KEY_LEGACY = 'si-map-weather-settings-v2';
const LS_KEY_LEGACY_V1 = 'si-map-weather-settings-v1';

export function loadStoredSiMapWeatherSettings(): SiMapWeatherSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SI_MAP_WEATHER };
  try {
    const raw =
      localStorage.getItem(LS_KEY) ??
      localStorage.getItem(LS_KEY_LEGACY) ??
      localStorage.getItem(LS_KEY_LEGACY_V1);
    if (!raw) return { ...DEFAULT_SI_MAP_WEATHER };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const migrated = {
      ...parsed,
      activePresets: Array.isArray(parsed.activePresets) ? parsed.activePresets : [],
    };
    return sanitizeSiMapWeatherSettings(migrated);
  } catch {
    return { ...DEFAULT_SI_MAP_WEATHER };
  }
}

export function persistSiMapWeatherSettings(settings: SiMapWeatherSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(sanitizeSiMapWeatherSettings(settings)));
  } catch {
    /* quota */
  }
}
