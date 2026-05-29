import type { Map as MapboxMap } from 'mapbox-gl';
import { applySiMapDaylightLight, siMapDaylightFogTint } from './siMapDaylight';
import { BUILDINGS_LAYER_ID, HILLSHADE_LAYER_ID } from './siMapProjectionTerrain';
import type { SiMapWeatherSettings } from './siMapWeatherTypes';

export const SI_WEATHER_SNOW_GROUND_LAYER = 'si-weather-snow-ground';

type FogSpec = {
  range: [number, number];
  color: string;
  'horizon-blend': number;
  'high-color'?: string;
  'space-color'?: string;
  'star-intensity'?: number;
};

const DEFAULT_FOG: FogSpec = {
  range: [0.5, 10],
  color: '#020617',
  'horizon-blend': 0.12,
  'high-color': '#1e293b',
  'space-color': '#020617',
  'star-intensity': 0.35,
};

function pct01(n: number): number {
  return Math.max(0, Math.min(1, n / 100));
}

function fogForSettings(s: SiMapWeatherSettings): FogSpec {
  const cloud = pct01(s.cloudCover);
  const fogAmt = pct01(s.fogDensity);
  const baseBlend = 0.08 + cloud * 0.35 + fogAmt * 0.42;

  switch (s.preset) {
    case 'sunny': {
      if (s.sunPositionByDateTime) {
        const tint = siMapDaylightFogTint(s.daylightMinutes);
        return {
          range: [0.6, 12],
          color: tint.color,
          'horizon-blend': tint.horizonBlend + cloud * 0.1,
          'high-color': tint.highColor,
          'space-color': '#020617',
          'star-intensity': tint.starIntensity,
        };
      }
      const warm = true;
      return {
        range: [0.6, 12],
        color: warm ? '#cbd5e1' : '#0f172a',
        'horizon-blend': 0.06 + cloud * 0.12,
        'high-color': warm ? '#e2e8f0' : '#1e293b',
        'space-color': '#020617',
        'star-intensity': 0.05,
      };
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

function tryMapboxPrecipitation(map: MapboxMap, s: SiMapWeatherSettings): void {
  const mapAny = map as MapboxMap & {
    setSnow?: (v: Record<string, unknown> | null) => void;
    setRain?: (v: Record<string, unknown> | null) => void;
  };
  const intensity = pct01(s.precipitation);
  try {
    if (s.preset === 'snow' && typeof mapAny.setSnow === 'function') {
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
    if (s.rainFlowEnabled) {
      mapAny.setRain?.(null);
      mapAny.setSnow?.(null);
      return;
    }
    if (s.preset === 'rain' && typeof mapAny.setRain === 'function') {
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
  try {
    map.setFog(fogForSettings(settings));
  } catch {
    /* ignore */
  }

  applySiMapDaylightLight(map, settings, {
    mapCenter: opts?.mapCenter,
    basemapId: opts?.basemapId,
    terrainElevated: Boolean(opts?.terrainElevated) || settings.sunPositionByDateTime,
  });

  tryMapboxPrecipitation(map, settings);

  const snowGround =
    Boolean(opts?.terrainElevated) &&
    settings.snowCover &&
    (settings.preset === 'snow' || settings.preset === 'cloudy');
  syncSnowGroundTint(map, snowGround);
}

export function clearSiMapWeatherEffects(map: MapboxMap): void {
  try {
    map.setFog(DEFAULT_FOG);
  } catch {
    /* ignore */
  }
  applySiMapDaylightLight(map, {
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
  });
  tryMapboxPrecipitation(map, {
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
  });
  syncSnowGroundTint(map, false);
}

/** Whether canvas particle overlay should run (rain/snow with intensity). */
export function siMapWeatherNeedsParticleOverlay(s: SiMapWeatherSettings): boolean {
  if (s.rainFlowEnabled) return false;
  if (s.preset !== 'rain' && s.preset !== 'snow') return false;
  return s.precipitation > 4;
}

/** Cloud veil strength for canvas overlay 0–1. */
export function siMapWeatherCloudVeilStrength(s: SiMapWeatherSettings): number {
  const base = pct01(s.cloudCover);
  if (s.rainFlowEnabled) return base * 0.2;
  if (s.preset === 'fog') return Math.max(base, pct01(s.fogDensity) * 0.85);
  if (s.preset === 'cloudy') return Math.max(base, 0.35);
  if (s.preset === 'rain' || s.preset === 'snow') return Math.max(base * 0.65, 0.2);
  return base * 0.45;
}
