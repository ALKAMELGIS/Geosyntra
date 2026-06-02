import type { Map as MapboxMap } from 'mapbox-gl';
import {
  applySiMapDaylightLight,
  normalizeDaylightMinutes,
  siMapDaylightFogTint,
  siMapDaylightLightSpec,
} from './siMapDaylight';
import {
  siMapCelestialSkyFogSpec,
  siMapFogSpecForPitchedView,
  siMapSkyViewExposure,
  syncSiMapSkyAtmosphereLayer,
} from './siMapSkyAtmosphere';
import {
  siMapWeatherActivePresets,
  isSiMapWeatherPrecipActive,
  isSiMapWeatherRainPrecipActive,
  isSiMapWeatherSnowPrecipActive,
} from './siMapWeatherActive';
import {
  DEFAULT_SI_MAP_WEATHER,
  isSiMapFogToolActive,
  type SiMapWeatherPreset,
  type SiMapWeatherSettings,
} from './siMapWeatherTypes';
import { BUILDINGS_LAYER_ID, HILLSHADE_LAYER_ID } from './siMapProjectionTerrain';
import { siMapWeatherNativePrecipitationAllowed } from './siMapToolIntegration';

export const SI_WEATHER_SNOW_GROUND_LAYER = 'si-weather-snow-ground';

type FogSpec = {
  range: [number, number];
  color: string;
  'horizon-blend': number;
  'high-color'?: string;
  'space-color'?: string;
  'star-intensity'?: number;
};

/** Globe backdrop without bright limb halo (sharp horizon, transparent high atmosphere). */
export const SI_MAP_GLOBE_FOG_NO_HALO: FogSpec = {
  range: [0.5, 10],
  color: '#020617',
  'horizon-blend': 0,
  'high-color': 'rgba(2, 6, 23, 0)',
  'space-color': '#020617',
  'star-intensity': 0.12,
};

const DEFAULT_FOG: FogSpec = SI_MAP_GLOBE_FOG_NO_HALO;

/** MapGL `fog` prop — default globe view (no atmosphere halo on the canvas). */
export const SI_MAP_GL_FOG_DEFAULT = {
  range: SI_MAP_GLOBE_FOG_NO_HALO.range,
  color: SI_MAP_GLOBE_FOG_NO_HALO.color,
  'horizon-blend': SI_MAP_GLOBE_FOG_NO_HALO['horizon-blend'],
  'high-color': SI_MAP_GLOBE_FOG_NO_HALO['high-color'],
  'space-color': SI_MAP_GLOBE_FOG_NO_HALO['space-color'],
  'star-intensity': SI_MAP_GLOBE_FOG_NO_HALO['star-intensity'],
};

export const SI_MAP_GL_FOG_ELEVATION = {
  range: [1.8, 16] as [number, number],
  color: '#0f172a',
  'horizon-blend': 0.02,
  'high-color': '#1e293b',
  'star-intensity': 0.08,
};

function softenFogForElevationView(spec: FogSpec): FogSpec {
  return {
    ...spec,
    range: [Math.max(spec.range[0], 1.4), Math.max(spec.range[1], 14)],
    'horizon-blend': Math.min(spec['horizon-blend'] ?? 0.1, 0.03),
    'star-intensity': Math.min(spec['star-intensity'] ?? 0.2, 0.1),
  };
}

function pct01(n: number): number {
  return Math.max(0, Math.min(1, n / 100));
}

const lastFogSigByMap = new WeakMap<MapboxMap, string>();
const lastLightingSigByMap = new WeakMap<MapboxMap, string>();

/** Signature for sun/sky lighting + atmosphere only (excludes precipitation, UI chrome). */
export function siMapWeatherLightingSignature(
  s: SiMapWeatherSettings,
  opts?: {
    mapCenter?: { lng: number; lat: number } | null;
    terrainElevated?: boolean;
    basemapId?: string;
  },
): string {
  const minutes = normalizeDaylightMinutes(s.daylightMinutes);
  const minKey = String(Math.round(minutes * 2) / 2);
  const lat =
    opts?.mapCenter?.lat != null && Number.isFinite(opts.mapCenter.lat)
      ? String(Math.round(opts.mapCenter.lat * 5) / 5)
      : '';
  const active = siMapWeatherActivePresets(s).join('+');
  return [
    active,
    s.preset,
    s.cloudCover,
    s.fogDensity,
    minKey,
    s.daylightDate,
    s.sunPositionByDateTime ? '1' : '0',
    s.daylightShadows ? '1' : '0',
    opts?.terrainElevated ? '1' : '0',
    opts?.basemapId ?? '',
    lat,
  ].join(':');
}

function fogSignature(spec: FogSpec): string {
  return JSON.stringify(spec);
}

function fogSpecForPreset(
  preset: SiMapWeatherPreset,
  s: SiMapWeatherSettings,
  baseBlend: number,
  fogAmt: number,
): FogSpec {
  switch (preset) {
    case 'sunny': {
      if (s.sunPositionByDateTime) {
        const tint = siMapDaylightFogTint(s.daylightMinutes);
        return {
          range: [0.6, 12],
          color: tint.color,
          'horizon-blend': 0,
          'high-color': 'rgba(2, 6, 23, 0)',
          'space-color': '#020617',
          'star-intensity': tint.starIntensity,
        };
      }
      return {
        range: [0.6, 12],
        color: '#cbd5e1',
        'horizon-blend': 0,
        'high-color': 'rgba(2, 6, 23, 0)',
        'space-color': '#020617',
        'star-intensity': 0.05,
      };
    }
    case 'sunSky': {
      if (s.sunPositionByDateTime) {
        const tint = siMapDaylightFogTint(s.daylightMinutes);
        return {
          range: [0.6, 12],
          color: tint.color,
          'horizon-blend': 0,
          'high-color': 'rgba(2, 6, 23, 0)',
          'space-color': '#020617',
          'star-intensity': tint.starIntensity,
        };
      }
      return DEFAULT_FOG;
    }
    case 'cloudy':
      return {
        range: [0.4, 8],
        color: '#94a3b8',
        'horizon-blend': baseBlend + 0.18,
        'high-color': '#cbd5e1',
        'space-color': '#334155',
        'star-intensity': 0.08,
      };
    case 'rain':
      return {
        range: [0.25, 6],
        color: '#64748b',
        'horizon-blend': baseBlend + 0.28,
        'high-color': '#475569',
        'space-color': '#1e293b',
        'star-intensity': 0.02,
      };
    case 'snow':
      return {
        range: [0.35, 9],
        color: '#e2e8f0',
        'horizon-blend': baseBlend + 0.22,
        'high-color': '#f8fafc',
        'space-color': '#cbd5e1',
        'star-intensity': 0.04,
      };
    case 'fog':
      return {
        range: [0.15, 4 - fogAmt * 2.2],
        color: '#e2e8f0',
        'horizon-blend': 0.45 + fogAmt * 0.45,
        'high-color': '#f1f5f9',
        'space-color': '#cbd5e1',
        'star-intensity': 0,
      };
    default:
      return DEFAULT_FOG;
  }
}

function mergeFogSpecs(specs: FogSpec[]): FogSpec {
  if (specs.length === 0) return DEFAULT_FOG;
  if (specs.length === 1) return specs[0]!;
  const horizon = Math.max(...specs.map(s => s['horizon-blend'] ?? 0));
  const rangeNear = Math.min(...specs.map(s => s.range[0]));
  const rangeFar = Math.min(...specs.map(s => s.range[1]));
  const stars = Math.max(...specs.map(s => s['star-intensity'] ?? 0));
  const pick = (key: keyof FogSpec) => {
    const ranked = specs
      .map(s => s[key])
      .filter((v): v is string | number => v != null);
    return ranked[0] ?? DEFAULT_FOG[key];
  };
  return {
    range: [rangeNear, rangeFar] as [number, number],
    color: String(pick('color')),
    'horizon-blend': horizon,
    'high-color': String(pick('high-color')),
    'space-color': String(pick('space-color')),
    'star-intensity': stars,
  };
}

function fogForSettings(s: SiMapWeatherSettings, elevationView = false): FogSpec {
  const cloud = pct01(s.cloudCover);
  const fogAmt = pct01(s.fogDensity);
  const baseBlend = 0.08 + cloud * 0.35 + fogAmt * 0.42;
  const active = siMapWeatherActivePresets(s);
  const specs = active.map(p => fogSpecForPreset(p, s, baseBlend, fogAmt));
  const spec = mergeFogSpecs(specs);
  return elevationView ? softenFogForElevationView(spec) : spec;
}

function tryMapboxPrecipitation(map: MapboxMap, s: SiMapWeatherSettings): void {
  if (!siMapWeatherNativePrecipitationAllowed(s)) {
    const mapAny = map as MapboxMap & {
      setSnow?: (v: Record<string, unknown> | null) => void;
      setRain?: (v: Record<string, unknown> | null) => void;
    };
    try {
      mapAny.setSnow?.(null);
      mapAny.setRain?.(null);
    } catch {
      /* ignore */
    }
    return;
  }
  const mapAny = map as MapboxMap & {
    setSnow?: (v: Record<string, unknown> | null) => void;
    setRain?: (v: Record<string, unknown> | null) => void;
  };
  const intensity = pct01(s.precipitation);
  try {
    if (isSiMapWeatherSnowPrecipActive(s) && typeof mapAny.setSnow === 'function') {
      mapAny.setRain?.(null);
      mapAny.setSnow({
        density: 0.15 + intensity * 0.85,
        intensity: 0.35 + intensity * 0.65,
        'center-thinning': 0.15,
        direction: [0, 40],
        opacity: 0.55 + intensity * 0.4,
        color: '#ffffff',
        'flake-size': 0.55 + intensity * 0.35,
        vignette: 0.15 + intensity * 0.25,
        'vignette-color': '#f8fafc',
      });
      return;
    }
    if (isSiMapWeatherRainPrecipActive(s) && typeof mapAny.setRain === 'function') {
      mapAny.setSnow?.(null);
      mapAny.setRain({
        density: 0.2 + intensity * 0.8,
        intensity: 0.4 + intensity * 0.6,
        direction: [0, 80],
        opacity: 0.45 + intensity * 0.45,
        color: '#94a3b8',
        vignette: 0.1 + intensity * 0.2,
        'vignette-color': '#64748b',
      });
      return;
    }
    mapAny.setSnow?.(null);
    mapAny.setRain?.(null);
  } catch {
    /* raster / custom styles may not support precipitation */
  }
}

function syncSnowGroundTint(map: MapboxMap, enabled: boolean): void {
  try {
    if (map.getLayer(HILLSHADE_LAYER_ID)) {
      map.setPaintProperty(
        HILLSHADE_LAYER_ID,
        'hillshade-highlight-color',
        enabled ? '#f8fafc' : '#e2e8f0',
      );
      map.setPaintProperty(
        HILLSHADE_LAYER_ID,
        'hillshade-shadow-color',
        enabled ? '#cbd5e1' : '#020617',
      );
      map.setPaintProperty(
        HILLSHADE_LAYER_ID,
        'hillshade-accent-color',
        enabled ? '#e2e8f0' : '#38bdf8',
      );
      map.setPaintProperty(
        HILLSHADE_LAYER_ID,
        'hillshade-exaggeration',
        enabled ? 0.35 : 0.85,
      );
    }
    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setPaintProperty(
        BUILDINGS_LAYER_ID,
        'fill-extrusion-color',
        enabled ? '#f1f5f9' : '#94a3b8',
      );
      map.setPaintProperty(
        BUILDINGS_LAYER_ID,
        'fill-extrusion-opacity',
        enabled ? 0.88 : 0.72,
      );
    }
  } catch {
    /* layers may be absent */
  }
}

/** Strip Mapbox globe limb halo while keeping dark space + light stars. */
/**
 * Sky-only update while tilting (stars + cloud halo). Does not enable Weather Fog tool.
 */
export function syncSiMapSkyCelestialForCamera(
  map: MapboxMap,
  settings: SiMapWeatherSettings,
  opts?: {
    mapCenter?: { lng: number; lat: number } | null;
  },
): void {
  if (!settings.sunPositionByDateTime) return;
  const lightSpec = siMapDaylightLightSpec(settings, opts?.mapCenter);
  if (!lightSpec) return;
  let pitch = 0;
  let bearing = 0;
  try {
    pitch = map.getPitch();
    bearing = map.getBearing();
  } catch {
    /* ignore */
  }
  syncSiMapSkyAtmosphereLayer(map, lightSpec.direction, {
    pitch,
    bearing,
    cloudCoverPct: settings.cloudCover,
  });
  if (!isSiMapFogToolActive(settings) && siMapSkyViewExposure(pitch) > 0) {
    try {
      map.setFog(siMapCelestialSkyFogSpec(pitch, lightSpec.direction.elevationDeg));
    } catch {
      /* ignore */
    }
  }
}

export function applySiGlobeFogNoHalo(map: MapboxMap): void {
  try {
    map.setFog(SI_MAP_GLOBE_FOG_NO_HALO);
  } catch {
    /* ignore */
  }
}

/** Sun/sky + atmosphere only — no precipitation, snow tint, or terrain bootstrap. */
export function applySiMapWeatherLightingEffects(
  map: MapboxMap,
  settings: SiMapWeatherSettings,
  opts?: {
    terrainElevated?: boolean;
    mapCenter?: { lng: number; lat: number } | null;
    basemapId?: string;
  },
): void {
  const sig = siMapWeatherLightingSignature(settings, opts);
  if (lastLightingSigByMap.get(map) === sig) return;
  lastLightingSigByMap.set(map, sig);

  let fogSpec = fogForSettings(settings, Boolean(opts?.terrainElevated));
  const fogToolOn = isSiMapFogToolActive(settings);
  if (settings.sunPositionByDateTime) {
    try {
      const pitch = typeof map.getPitch === 'function' ? map.getPitch() : 0;
      const lightSpec = siMapDaylightLightSpec(settings, opts?.mapCenter);
      if (lightSpec) {
        if (fogToolOn && pitch > 6) {
          fogSpec = siMapFogSpecForPitchedView(fogSpec, pitch, lightSpec.direction.elevationDeg);
        } else if (!fogToolOn && siMapSkyViewExposure(pitch) > 0) {
          fogSpec = siMapCelestialSkyFogSpec(pitch, lightSpec.direction.elevationDeg);
        }
      }
    } catch {
      /* ignore */
    }
  }
  const fogSig = fogSignature(fogSpec);
  if (lastFogSigByMap.get(map) !== fogSig) {
    try {
      map.setFog(fogSpec);
      lastFogSigByMap.set(map, fogSig);
    } catch {
      /* ignore */
    }
  }

  applySiMapDaylightLight(map, settings, {
    mapCenter: opts?.mapCenter,
    basemapId: opts?.basemapId,
    terrainElevated: Boolean(opts?.terrainElevated) || settings.sunPositionByDateTime,
  });
}

/** Apply atmosphere + optional native precipitation + 3D snow tint. */
export function applySiMapWeatherEffects(
  map: MapboxMap,
  settings: SiMapWeatherSettings,
  opts?: {
    terrainElevated?: boolean;
    mapCenter?: { lng: number; lat: number } | null;
    basemapId?: string;
  },
): void {
  applySiMapWeatherLightingEffects(map, settings, opts);

  const precipSig = siMapWeatherPrecipitationSignature(settings);
  if (lastPrecipSigByMap.get(map) !== precipSig) {
    lastPrecipSigByMap.set(map, precipSig);
    tryMapboxPrecipitation(map, settings);
  }

  const active = siMapWeatherActivePresets(settings);
  const snowGround =
    Boolean(opts?.terrainElevated) &&
    settings.snowCover &&
    (active.includes('snow') || active.includes('cloudy'));
  const snowSig = snowGround ? '1' : '0';
  if (lastWeatherEffectsFullSigByMap.get(map) !== snowSig) {
    lastWeatherEffectsFullSigByMap.set(map, snowSig);
    syncSnowGroundTint(map, snowGround);
  }
}

const lastWeatherEffectsFullSigByMap = new WeakMap<MapboxMap, string>();
const lastPrecipSigByMap = new WeakMap<MapboxMap, string>();

function siMapWeatherPrecipitationSignature(s: SiMapWeatherSettings): string {
  const active = siMapWeatherActivePresets(s).join('+');
  return [active, s.precipitation, s.snowCover ? '1' : '0'].join(':');
}

export function resetSiMapWeatherEffectCache(map: MapboxMap): void {
  lastFogSigByMap.delete(map);
  lastLightingSigByMap.delete(map);
  lastWeatherEffectsFullSigByMap.delete(map);
  lastPrecipSigByMap.delete(map);
}

export function clearSiMapWeatherEffects(map: MapboxMap): void {
  resetSiMapWeatherEffectCache(map);
  try {
    map.setFog(DEFAULT_FOG);
  } catch {
    /* ignore */
  }
  applySiMapDaylightLight(map, {
    ...DEFAULT_SI_MAP_WEATHER,
    preset: 'sunny',
    cloudCover: 0,
    precipitation: 0,
    snowCover: false,
    fogDensity: 0,
    daylightMinutes: 720,
    daylightDate: '2026-03-15',
    sunPositionByDateTime: false,
    daylightShadows: false,
    daylightTimePlaying: false,
    daylightDatePlaying: false,
  });
  tryMapboxPrecipitation(map, {
    ...DEFAULT_SI_MAP_WEATHER,
    preset: 'sunny',
    cloudCover: 0,
    precipitation: 0,
    snowCover: false,
    fogDensity: 0,
    daylightMinutes: 720,
    daylightDate: '2026-03-15',
    sunPositionByDateTime: true,
    daylightShadows: false,
    daylightTimePlaying: false,
    daylightDatePlaying: false,
  });
  syncSnowGroundTint(map, false);
}

/** Whether canvas particle overlay should run (rain/snow with intensity). */
export function siMapWeatherNeedsParticleOverlay(s: SiMapWeatherSettings): boolean {
  if (!isSiMapWeatherPrecipActive(s)) return false;
  return s.precipitation > 4;
}

/** Cloud veil strength for canvas overlay 0–1. */
export function siMapWeatherCloudVeilStrength(s: SiMapWeatherSettings): number {
  const active = siMapWeatherActivePresets(s);
  if (active.length === 0 || (active.length === 1 && active[0] === 'sunSky')) return 0;
  const base = pct01(s.cloudCover);
  let veil = base * 0.45;
  if (active.includes('fog')) veil = Math.max(veil, Math.max(base, pct01(s.fogDensity) * 0.85));
  if (active.includes('cloudy')) veil = Math.max(veil, Math.max(base, 0.35));
  if (active.includes('rain') || active.includes('snow')) veil = Math.max(veil, Math.max(base * 0.65, 0.2));
  if (active.includes('sunny') && !active.includes('sunSky')) veil = Math.max(veil, base * 0.45);
  return active.includes('sunSky') && active.length === 1 ? 0 : veil;
}
