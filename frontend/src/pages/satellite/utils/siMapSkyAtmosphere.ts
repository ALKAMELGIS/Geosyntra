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
  /** 3D elevation dock / terrain view — stronger space backdrop. */
  elevation3d?: boolean;
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

/** 0..1 how much the camera looks toward the sky (pitch toward horizon / sky dome). */
export function siMapSkyViewExposure(pitchDeg: number): number {
  const pitch = Math.max(0, Math.min(85, pitchDeg));
  if (pitch < 1) return 0;
  return clamp01((pitch - 1) / 70);
}

/**
 * Space backdrop exposure — keeps stars/nebula visible in globe orbit and 3D elevation,
 * ramping up smoothly as the camera pitches toward the horizon.
 */
export function siMapSpaceViewExposure(
  pitchDeg: number,
  opts?: { elevation3d?: boolean },
): number {
  const fromPitch = siMapSkyViewExposure(pitchDeg);
  const floor = opts?.elevation3d ? 0.58 : 0.38;
  return Math.max(fromPitch, floor);
}

function skyCloudHaloPaint(
  _sun: SiMapSunDirection,
  _camera: SiMapSkyCameraView | undefined,
): { haloColor: string; haloBlend: number } {
  /** No limb halo — bright horizon rings flash as a thin white line during orbit. */
  return { haloColor: 'rgba(0, 0, 0, 0)', haloBlend: 0 };
}

/** Deep-space fog for globe orbit and 3D elevation — Google Earth–style stars + limb glow. */
export function siMapGlobeOrbitSpaceFogSpec(
  pitchDeg: number,
  sunElevationDeg: number,
  opts?: { elevation3d?: boolean },
): {
  range: [number, number];
  color: string;
  'horizon-blend': number;
  'high-color': string;
  'space-color': string;
  'star-intensity': number;
} {
  const skyT = siMapSpaceViewExposure(pitchDeg, opts);
  const night = sunElevationDeg < 5;
  const twilight = sunElevationDeg >= 5 && sunElevationDeg < 14;
  const starBase = night ? 0.36 : twilight ? 0.2 : 0.12;
  return {
    range: [0.8, 14 + skyT * 14],
    color: `rgba(118, 156, 210, ${0.05 + skyT * 0.11})`,
    'horizon-blend': 0,
    'high-color': '#010409',
    'space-color': '#010409',
    'star-intensity': Math.min(0.95, starBase + skyT * (night ? 0.5 : twilight ? 0.3 : 0.18)),
  };
}

/** Celestial dome fog — stars / space only; not the Weather “Fog” tool haze. */
export function siMapCelestialSkyFogSpec(
  pitchDeg: number,
  sunElevationDeg: number,
  opts?: { elevation3d?: boolean },
): ReturnType<typeof siMapGlobeOrbitSpaceFogSpec> {
  return siMapGlobeOrbitSpaceFogSpec(pitchDeg, sunElevationDeg, opts);
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
  const skyT = siMapSpaceViewExposure(camera?.pitch ?? 0, { elevation3d: camera?.elevation3d });
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
