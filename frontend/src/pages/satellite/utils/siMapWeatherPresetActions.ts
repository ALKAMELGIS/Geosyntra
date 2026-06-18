import {
  isSiMapWeatherPresetActive,
  siMapWeatherActivePresets,
} from './siMapWeatherActive';
import {
  sanitizeSiMapWeatherSettings,
  type SiMapWeatherPreset,
  type SiMapWeatherSettings,
} from './siMapWeatherTypes';

export type SiMapWeatherPresetClickOptions = {
  sunSkyBuildingShadows?: boolean;
};

function withSunSkyEnable(
  settings: SiMapWeatherSettings,
  options: SiMapWeatherPresetClickOptions,
): SiMapWeatherSettings {
  return {
    ...settings,
    sunPositionByDateTime: true,
    daylightShadows: options.sunSkyBuildingShadows ?? settings.daylightShadows,
  };
}

function withSunSkyDisable(settings: SiMapWeatherSettings): SiMapWeatherSettings {
  return {
    ...settings,
    daylightTimePlaying: false,
    daylightDatePlaying: false,
    sunPositionByDateTime: false,
  };
}

/** Merge preset ids into activePresets (stable order, de-duplicated). */
export function mergeSiMapWeatherActivePresets(
  settings: SiMapWeatherSettings,
  ids: SiMapWeatherPreset[],
): SiMapWeatherPreset[] {
  const base = siMapWeatherActivePresets(settings);
  const merged = new Set<SiMapWeatherPreset>([...base, ...ids]);
  const order: SiMapWeatherPreset[] = ['sunny', 'cloudy', 'rain', 'snow', 'fog', 'sunSky'];
  return order.filter(id => merged.has(id));
}

export function enableSiMapWeatherPreset(
  settings: SiMapWeatherSettings,
  id: SiMapWeatherPreset,
  options: SiMapWeatherPresetClickOptions = {},
): SiMapWeatherSettings {
  const active = siMapWeatherActivePresets(settings);
  if (active.includes(id)) {
    return sanitizeSiMapWeatherSettings({ ...settings, preset: id });
  }
  let next: SiMapWeatherSettings = {
    ...settings,
    preset: id,
    activePresets: mergeSiMapWeatherActivePresets(settings, [id]),
  };
  if (id === 'snow' && !settings.snowCover) next = { ...next, snowCover: true };
  if (id === 'sunSky') next = withSunSkyEnable(next, options);
  return sanitizeSiMapWeatherSettings(next);
}

export function disableSiMapWeatherPreset(
  settings: SiMapWeatherSettings,
  id: SiMapWeatherPreset,
): SiMapWeatherSettings {
  const active = siMapWeatherActivePresets(settings);
  if (!active.includes(id)) return settings;
  const remaining = active.filter(p => p !== id);
  const nextPanel =
    settings.preset === id
      ? remaining.length > 0
        ? remaining[remaining.length - 1]!
        : settings.preset
      : settings.preset;
  let next: SiMapWeatherSettings = {
    ...settings,
    preset: nextPanel,
    activePresets: remaining,
  };
  if (id === 'sunSky') next = withSunSkyDisable(next);
  return sanitizeSiMapWeatherSettings(next);
}

export function focusSiMapWeatherPreset(
  settings: SiMapWeatherSettings,
  id: SiMapWeatherPreset,
): SiMapWeatherSettings {
  if (settings.preset === id) return settings;
  return sanitizeSiMapWeatherSettings({ ...settings, preset: id });
}

/**
 * Independent toggle per icon — ON adds to activePresets, OFF removes only that id.
 * Sun & Sky composes with rain/cloud/fog/snow; disabling Sun & Sky never stops other tools.
 */
export function applySiMapWeatherPresetClick(
  settings: SiMapWeatherSettings,
  id: SiMapWeatherPreset,
  options: SiMapWeatherPresetClickOptions = {},
): SiMapWeatherSettings {
  const active = siMapWeatherActivePresets(settings);
  if (active.includes(id)) return disableSiMapWeatherPreset(settings, id);
  return enableSiMapWeatherPreset(settings, id, options);
}

/** Sliders / modules that should show while any matching preset is running. */
export function siMapWeatherPanelControlFlags(settings: SiMapWeatherSettings): {
  showPrecip: boolean;
  showFog: boolean;
  showSnowCover: boolean;
} {
  const active = siMapWeatherActivePresets(settings);
  return {
    showPrecip: active.includes('rain') || active.includes('snow'),
    showFog: active.includes('fog') || active.includes('cloudy') || active.includes('rain'),
    showSnowCover: active.includes('snow') || active.includes('cloudy'),
  };
}

export function siMapWeatherRunningSummary(settings: SiMapWeatherSettings): SiMapWeatherPreset[] {
  return siMapWeatherActivePresets(settings);
}

export function isSiMapWeatherPresetPanelFocused(
  settings: SiMapWeatherSettings,
  id: SiMapWeatherPreset,
): boolean {
  return settings.preset === id && isSiMapWeatherPresetActive(settings, id);
}
