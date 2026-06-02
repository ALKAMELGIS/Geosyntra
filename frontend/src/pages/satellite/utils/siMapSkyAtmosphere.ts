/**
 * Mapbox GL sky — sun atmosphere, celestial stars, and horizon cloud wisps when the
 * camera tilts toward the sky. Weather **Fog** tool is separate (see siMapWeatherEffects).
 */
import type { Map as MapboxMap } from 'mapbox-gl';
import type { SiMapSunDirection } from './siMapDaylight';

export const SI_SKY_ATMOSPHERE_LAYER_ID = 'si-sky-atmosphere';

export type SiMapSkyCameraView = {
  pitch?: number;
  bearing?: number;
  /** 0–100 cloud cover from weather panel (soft cloud halo, not Fog tool). */
  cloudCoverPct?: number;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function skySunPaint(sun: SiMapSunDirection): {
  sun: [number, number];
  intensity: number;
} {
  const elev = sun.elevationDeg;
  const polar = Math.max(0, Math.min(90, 90 - elev));
  const az = ((sun.azimuth % 360) + 360) % 360;
  const intensity =
    elev < -4 ? 0 : elev < 2 ? 4 + elev * 2 : Math.min(22, 10 + elev * 0.35);
  return { sun: [az, polar], intensity };
}

/** 0..1 how much the camera looks toward the sky (pitch toward horizon). */
export function siMapSkyViewExposure(pitchDeg: number): number {
  const pitch = Math.max(0, Math.min(85, pitchDeg));
  if (pitch < 10) return 0;
  return clamp01((pitch - 10) / 55);
}

function skyCloudHaloPaint(
  sun: SiMapSunDirection,
  camera: SiMapSkyCameraView | undefined,
): { haloColor: string; haloBlend: number } {
  const skyT = siMapSkyViewExposure(camera?.pitch ?? 0);
  const cloud = clamp01((camera?.cloudCoverPct ?? 0) / 100);
  const day = sun.elevationDeg > 5;
  const haloBlend = 0.02 + skyT * (0.1 + cloud * 0.08);
  const haloColor = day
    ? `rgba(${220 - cloud * 40}, ${235 - cloud * 30}, ${255}, ${0.35 + skyT * 0.45})`
    : `rgba(${180 + skyT * 40}, ${190 + skyT * 30}, ${220}, ${0.25 + skyT * 0.35})`;
  return { haloColor, haloBlend };
}

/** Celestial dome fog — stars / space only; not the Weather “Fog” tool haze. */
export function siMapCelestialSkyFogSpec(
  pitchDeg: number,
  sunElevationDeg: number,
): {
  range: [number, number];
  color: string;
  'horizon-blend': number;
  'high-color': string;
  'space-color': string;
  'star-intensity': number;
} {
  const skyT = siMapSkyViewExposure(pitchDeg);
  const night = sunElevationDeg < -2;
  const twilight = sunElevationDeg >= -2 && sunElevationDeg < 8;
  const starBase = night ? 0.22 : twilight ? 0.08 : 0.02;
  return {
    range: [0.8, 12 + skyT * 10],
    color: `rgba(186, 210, 235, ${0.08 + skyT * 0.06})`,
    'horizon-blend': 0.03 + skyT * 0.06,
    'high-color': night ? '#243352' : '#7eb8e8',
    'space-color': night || twilight ? '#030712' : '#1e4d6b',
    'star-intensity': Math.min(0.9, starBase + skyT * (night ? 0.55 : twilight ? 0.28 : 0.06)),
  };
}

/** Insert or update the atmosphere sky layer (no-op if style rejects sky layers). */
export function syncSiMapSkyAtmosphereLayer(
  map: MapboxMap,
  sun: SiMapSunDirection | null,
  camera?: SiMapSkyCameraView,
): void {
  if (!sun) {
    removeSiMapSkyAtmosphereLayer(map);
    return;
  }
  const { sun: sunPos, intensity } = skySunPaint(sun);
  const { haloColor, haloBlend } = skyCloudHaloPaint(sun, camera);
  const skyT = siMapSkyViewExposure(camera?.pitch ?? 0);
  try {
    const paint: Record<string, unknown> = {
      'sky-type': 'atmosphere',
      'sky-atmosphere-sun': sunPos,
      'sky-atmosphere-sun-intensity': intensity + skyT * 2,
      'sky-atmosphere-halo-color': haloColor,
      'sky-atmosphere-halo-blend': haloBlend,
    };
    if (!map.getLayer(SI_SKY_ATMOSPHERE_LAYER_ID)) {
      const layers = map.getStyle()?.layers ?? [];
      const beforeId = layers[0]?.id;
      map.addLayer(
        {
          id: SI_SKY_ATMOSPHERE_LAYER_ID,
          type: 'sky',
          paint,
        },
        beforeId,
      );
    } else {
      for (const [k, v] of Object.entries(paint)) {
        map.setPaintProperty(SI_SKY_ATMOSPHERE_LAYER_ID, k, v);
      }
    }
  } catch {
    /* raster / legacy styles may not support sky */
  }
}

export function removeSiMapSkyAtmosphereLayer(map: MapboxMap): void {
  try {
    if (map.getLayer(SI_SKY_ATMOSPHERE_LAYER_ID)) map.removeLayer(SI_SKY_ATMOSPHERE_LAYER_ID);
  } catch {
    /* ignore */
  }
}

/** Stronger horizon haze when the camera is pitched — only when Weather Fog tool is active. */
export function siMapFogSpecForPitchedView(
  base: {
    range: [number, number];
    color: string;
    'horizon-blend'?: number;
    'high-color'?: string;
    'space-color'?: string;
    'star-intensity'?: number;
  },
  pitchDeg: number,
  sunElevationDeg: number,
): typeof base {
  const pitch = Math.max(0, Math.min(85, pitchDeg));
  const t = pitch / 85;
  const night = sunElevationDeg < -2;
  const horizonBlend = Math.min(0.42, (base['horizon-blend'] ?? 0.08) + t * 0.28);
  const starIntensity = night
    ? Math.min(0.65, (base['star-intensity'] ?? 0.2) + t * 0.35)
    : Math.min(0.2, (base['star-intensity'] ?? 0.05) * (1 - t * 0.5));
  return {
    ...base,
    range: [base.range[0], Math.max(base.range[1], 8 + t * 10)] as [number, number],
    'horizon-blend': horizonBlend,
    'star-intensity': starIntensity,
  };
}
