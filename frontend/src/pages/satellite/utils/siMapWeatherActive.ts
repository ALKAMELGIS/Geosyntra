import {
  type SiMapWeatherPreset,
  type SiMapWeatherSettings,
} from './siMapWeatherTypes';

const PRESET_ORDER: SiMapWeatherPreset[] = ['sunny', 'cloudy', 'rain', 'snow', 'fog', 'sunSky'];

/** Normalized, de-duplicated active presets (stable order). Empty = no tools running. */
export function siMapWeatherActivePresets(s: SiMapWeatherSettings): SiMapWeatherPreset[] {
  if (Array.isArray(s.activePresets)) {
    if (s.activePresets.length === 0) return [];
    const seen = new Set<SiMapWeatherPreset>();
    const out: SiMapWeatherPreset[] = [];
    for (const id of PRESET_ORDER) {
      if (s.activePresets.includes(id) && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }
  /** Legacy settings without activePresets array — no tools running until user toggles. */
  return [];
}

/** Rain, snow, fog, or cloudy layers are actively driving atmosphere (not Sun & Sky alone). */
export function siMapWeatherHasAtmosphericEffects(s: SiMapWeatherSettings): boolean {
  const active = siMapWeatherActivePresets(s);
  return active.some(p => p === 'cloudy' || p === 'rain' || p === 'snow' || p === 'fog');
}

/** Sun & Sky date/time lighting is active and should compose with other weather tools. */
export function isSiMapWeatherSunSkyLightingActive(s: SiMapWeatherSettings): boolean {
  return isSiMapWeatherPresetActive(s, 'sunSky') && s.sunPositionByDateTime;
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

/** True when imperative weather sync owns MapGL fog/light (not react-map-gl props). */
export function siMapWeatherImperativeMapEffectsActive(s: SiMapWeatherSettings): boolean {
  return siMapWeatherActivePresets(s).length > 0;
}
