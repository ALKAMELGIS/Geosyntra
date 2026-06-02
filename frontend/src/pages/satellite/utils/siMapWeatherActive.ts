import {
  SI_MAP_WEATHER_PRESETS,
  type SiMapWeatherPreset,
  type SiMapWeatherSettings,
} from './siMapWeatherTypes';

const PRESET_ORDER: SiMapWeatherPreset[] = ['sunny', 'cloudy', 'rain', 'snow', 'fog', 'sunSky'];

/** Normalized, de-duplicated active presets (stable order). */
export function siMapWeatherActivePresets(s: SiMapWeatherSettings): SiMapWeatherPreset[] {
  const raw = Array.isArray(s.activePresets) ? s.activePresets : [s.preset];
  const seen = new Set<SiMapWeatherPreset>();
  const out: SiMapWeatherPreset[] = [];
  for (const id of PRESET_ORDER) {
    if (raw.includes(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  if (out.length === 0) {
    const fallback = SI_MAP_WEATHER_PRESETS.some(p => p.id === s.preset) ? s.preset : 'sunny';
    return [fallback];
  }
  return out;
}

export function isSiMapWeatherPresetActive(
  s: SiMapWeatherSettings,
  preset: SiMapWeatherPreset,
): boolean {
  return siMapWeatherActivePresets(s).includes(preset);
}

/** Sun & Sky map overlay + daylight tools are running. */
export function isSiMapSunSkyWeatherActive(s: SiMapWeatherSettings): boolean {
  return isSiMapWeatherPresetActive(s, 'sunSky');
}

export function isSiMapWeatherPrecipActive(s: SiMapWeatherSettings): boolean {
  const active = siMapWeatherActivePresets(s);
  return active.includes('rain') || active.includes('snow');
}

export function isSiMapWeatherSnowPrecipActive(s: SiMapWeatherSettings): boolean {
  return isSiMapWeatherPresetActive(s, 'snow');
}

export function isSiMapWeatherRainPrecipActive(s: SiMapWeatherSettings): boolean {
  return isSiMapWeatherPresetActive(s, 'rain');
}
