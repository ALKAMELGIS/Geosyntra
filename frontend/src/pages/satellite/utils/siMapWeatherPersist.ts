import {
  DEFAULT_SI_MAP_WEATHER,
  sanitizeSiMapWeatherSettings,
  type SiMapWeatherSettings,
} from './siMapWeatherTypes';

const LS_KEY = 'si-map-weather-settings-v1';

export function loadStoredSiMapWeatherSettings(): SiMapWeatherSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SI_MAP_WEATHER };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_SI_MAP_WEATHER };
    return sanitizeSiMapWeatherSettings(JSON.parse(raw));
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
