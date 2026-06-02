import type { Map as MapboxMap } from 'mapbox-gl';
import {
  BUILDINGS_LAYER_ID,
  HILLSHADE_LAYER_ID,
  ensureSiMapDaylightTerrainSupport,
} from './siMapProjectionTerrain';
import { removeSiMapSkyAtmosphereLayer, syncSiMapSkyAtmosphereLayer } from './siMapSkyAtmosphere';
import type { SiMapWeatherSettings } from './siMapWeatherTypes';

/** ArcGIS Scene daylight slider: 0 = 12:00 AM … 1439 = 11:59 PM. */
export const SI_DAYLIGHT_MINUTES_MAX = 1439;

export const SI_MAP_DAYLIGHT_TZ_LABEL = 'GMT';

export type SiDaylightTimePreset = 'morning' | 'day' | 'evening' | 'night';

export type SiMapDaylightTick = {
  minutes: number;
  label: string;
  kind: 'primary' | 'secondary';
};

/** ArcGIS Scene Viewer–style quick time presets. */
export const SI_DAYLIGHT_TIME_PRESETS: ReadonlyArray<{
  id: SiDaylightTimePreset;
  label: string;
  minutes: number;
}> = [
  { id: 'morning', label: 'Morning', minutes: 420 },
  { id: 'day', label: 'Day', minutes: 720 },
  { id: 'evening', label: 'Evening', minutes: 1080 },
  { id: 'night', label: 'Night', minutes: 1320 },
];

/** Primary + secondary ticks (ArcGIS Scene Viewer). */
export const SI_DAYLIGHT_TICKS: readonly SiMapDaylightTick[] = [
  { minutes: 0, label: '12 AM', kind: 'primary' },
  { minutes: 120, label: '', kind: 'secondary' },
  { minutes: 240, label: '', kind: 'secondary' },
  { minutes: 360, label: '6 AM', kind: 'primary' },
  { minutes: 480, label: '', kind: 'secondary' },
  { minutes: 600, label: '', kind: 'secondary' },
  { minutes: 720, label: '12 PM', kind: 'primary' },
  { minutes: 840, label: '', kind: 'secondary' },
  { minutes: 960, label: '', kind: 'secondary' },
  { minutes: 1080, label: '6 PM', kind: 'primary' },
  { minutes: 1200, label: '', kind: 'secondary' },
  { minutes: 1320, label: '', kind: 'secondary' },
  { minutes: SI_DAYLIGHT_MINUTES_MAX, label: '12 AM', kind: 'primary' },
];

const SI_SUN_LIGHT_ID = 'si-sun-directional';
const SI_AMBIENT_LIGHT_ID = 'si-sun-ambient';
const SI_LIGHT_TRANSITION_MS = 280;
/** Cap lighting sync rate during daylight animation (~30 Hz). */
export const SI_DAYLIGHT_LIGHT_SYNC_MIN_MS = 33;

const lastStandardPresetByMap = new WeakMap<MapboxLightingMap, string>();
const lastDaylightLightSigByMap = new WeakMap<MapboxLightingMap, string>();
const lastDaylightLightSyncMsByMap = new WeakMap<MapboxLightingMap, number>();

export function siMapDaylightTimeTickLabels(): readonly SiMapDaylightTick[] {
  return SI_DAYLIGHT_TICKS;
}

export function clampDaylightMinutes(n: unknown, fallback = 720): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(SI_DAYLIGHT_MINUTES_MAX, v));
}

/** Continuous minutes (allows fractional values during playback). */
export function normalizeDaylightMinutes(minutes: number): number {
  const v = Number(minutes);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(SI_DAYLIGHT_MINUTES_MAX, v));
}

export function siMapDaylightHourFromMinutes(minutes: number): number {
  return normalizeDaylightMinutes(minutes) / 60;
}

export function siMapDaylightMinutesFromHour(hour24: number): number {
  const h = Math.max(0, Math.min(24, hour24));
  return Math.round(h * 60) % (SI_DAYLIGHT_MINUTES_MAX + 1);
}

export function siMapDaylightTodayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function sanitizeDaylightDateIso(raw: unknown, fallback?: string): string {
  const fb = fallback ?? siMapDaylightTodayIso();
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return fb;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return fb;
  return raw.trim();
}

export function formatDaylightDateDisplay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return `${m}/${d}/${y}`;
}

/** Minutes since midnight → "8:30 PM GMT" (ArcGIS aria-valuetext). */
export function formatDaylightMinutesLabel(
  minutes: number,
  tzLabel = SI_MAP_DAYLIGHT_TZ_LABEL,
): string {
  const m = clampDaylightMinutes(minutes);
  const hr = Math.floor(m / 60) % 24;
  const min = m % 60;
  const isPm = hr >= 12;
  const hr12 = hr % 12 === 0 ? 12 : hr % 12;
  const minStr = String(min).padStart(2, '0');
  return `${hr12}:${minStr} ${isPm ? 'PM' : 'AM'} ${tzLabel}`;
}

/** @deprecated Use formatDaylightMinutesLabel */
export function formatDaylightTimeLabel(hour24: number, tzLabel = SI_MAP_DAYLIGHT_TZ_LABEL): string {
  return formatDaylightMinutesLabel(siMapDaylightMinutesFromHour(hour24), tzLabel);
}

export function daylightMinutesToPercent(minutes: number): number {
  return (clampDaylightMinutes(minutes) / SI_DAYLIGHT_MINUTES_MAX) * 100;
}

export function percentToDaylightMinutes(pct: number): number {
  return clampDaylightMinutes((pct / 100) * SI_DAYLIGHT_MINUTES_MAX);
}

export function matchSiDaylightPreset(minutes: number): SiDaylightTimePreset | null {
  const m = clampDaylightMinutes(minutes);
  for (const preset of SI_DAYLIGHT_TIME_PRESETS) {
    if (Math.abs(m - preset.minutes) <= 10) return preset.id;
  }
  return null;
}

function dayOfYearFromIso(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = Date.UTC(y, 0, 0);
  const cur = Date.UTC(y, m - 1, d);
  return Math.floor((cur - start) / 86_400_000);
}

function solarDeclinationRad(isoDate: string): number {
  const n = dayOfYearFromIso(isoDate);
  return ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + n)) / 365);
}

export type SiMapSunDirection = {
  /** Degrees clockwise from north (Mapbox directional light). */
  azimuth: number;
  /** Zenith angle 0 = overhead, 90 = horizon; clipped to Mapbox shadow range. */
  polar: number;
  elevationDeg: number;
};

/**
 * Date/time + latitude sun vector — equivalent to ArcGIS Scene `environment.lighting` type sun.
 * Uses UTC minutes + ISO date (GMT slider in UI).
 */
export function computeSiMapSunDirection(
  minutes: number,
  isoDate: string,
  latDeg = 30,
): SiMapSunDirection {
  const hour = siMapDaylightHourFromMinutes(minutes);
  const decl = solarDeclinationRad(isoDate);
  const lat = (latDeg * Math.PI) / 180;
  const hourAngle = ((hour - 12) / 12) * Math.PI;

  const sinElev =
    Math.sin(decl) * Math.sin(lat) + Math.cos(decl) * Math.cos(lat) * Math.cos(hourAngle);
  const elevRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  const elevationDeg = (elevRad * 180) / Math.PI;

  const cosAz =
    (Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.sin(lat) * Math.cos(hourAngle)) /
    Math.max(1e-6, Math.cos(elevRad));
  const azRad = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  let azimuth = (azRad * 180) / Math.PI;
  if (Math.sin(hourAngle) > 0) azimuth = 360 - azimuth;
  azimuth = ((azimuth % 360) + 360) % 360;

  // Mapbox clips polar > 75° for shadow-map quality.
  const polar = Math.max(6, Math.min(75, 90 - elevationDeg));

  return { azimuth, polar, elevationDeg };
}

/**
 * Legacy flat-light position `[radial, azimuth, polar]` for styles without 3D lights.
 */
export function computeSiMapSunLightPosition(
  minutes: number,
  isoDate: string,
  latDeg = 30,
): [number, number, number] {
  const { azimuth, elevationDeg } = computeSiMapSunDirection(minutes, isoDate, latDeg);
  const polar = Math.max(6, Math.min(88, 90 - elevationDeg));
  const radial = elevationDeg > 5 ? 1.12 + elevationDeg / 180 : 1.42;
  return [radial, azimuth, polar];
}

export function siMapDaylightLightColor(minutes: number): string {
  const hour = siMapDaylightHourFromMinutes(minutes);
  if (hour >= 6 && hour <= 18) return '#fff8f0';
  if (hour >= 5 && hour < 6) return '#fde68a';
  if (hour > 18 && hour <= 20) return '#fdba74';
  if (hour > 20 || hour < 5) return '#94a3b8';
  return '#cbd5e1';
}

export function siMapDaylightLightIntensity(minutes: number): number {
  const hour = siMapDaylightHourFromMinutes(minutes);
  if (hour >= 8 && hour <= 16) return 0.88;
  if (hour >= 6 && hour <= 18) return 0.68;
  if (hour >= 5.5 && hour <= 19.5) return 0.38;
  return 0.1;
}

export function siMapDaylightAmbientColor(minutes: number): string {
  const hour = siMapDaylightHourFromMinutes(minutes);
  if (hour >= 8 && hour <= 16) return 'rgba(255, 248, 240, 255)';
  if (hour >= 6 && hour <= 18) return 'rgba(226, 232, 240, 255)';
  if (hour >= 5 && hour <= 20) return 'rgba(148, 163, 184, 255)';
  return 'rgba(71, 85, 105, 255)';
}

export function siMapDaylightAmbientLevel(minutes: number): number {
  const hour = siMapDaylightHourFromMinutes(minutes);
  if (hour >= 8 && hour <= 16) return 0.34;
  if (hour >= 6 && hour <= 18) return 0.22;
  if (hour >= 5 && hour <= 20) return 0.12;
  return 0.06;
}

export function siMapDaylightShadowIntensity(minutes: number): number {
  const hour = siMapDaylightHourFromMinutes(minutes);
  if (hour >= 9 && hour <= 15) return 0.92;
  if (hour >= 7 && hour <= 17) return 0.78;
  if (hour >= 5.5 && hour <= 19.5) return 0.55;
  return 0.28;
}

/** Mapbox Standard style light preset (dawn/day/dusk/night). */
export function siMapStandardLightPreset(
  minutes: number,
): 'dawn' | 'day' | 'dusk' | 'night' {
  const hour = siMapDaylightHourFromMinutes(minutes);
  if (hour >= 6 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** Atmospheric tint for fog when daylight drives the scene. */
export function siMapDaylightFogTint(minutes: number): {
  color: string;
  highColor: string;
  starIntensity: number;
  horizonBlend: number;
} {
  const hour = siMapDaylightHourFromMinutes(minutes);
  if (hour >= 7 && hour <= 17) {
    return {
      color: '#cbd5e1',
      highColor: '#e2e8f0',
      starIntensity: 0.04,
      horizonBlend: 0.08,
    };
  }
  if (hour >= 5.5 && hour < 7) {
    return {
      color: '#fdba74',
      highColor: '#fde68a',
      starIntensity: 0.02,
      horizonBlend: 0.14,
    };
  }
  if (hour > 17 && hour <= 20) {
    return {
      color: '#64748b',
      highColor: '#94a3b8',
      starIntensity: 0.12,
      horizonBlend: 0.16,
    };
  }
  return {
    color: '#0f172a',
    highColor: '#1e293b',
    starIntensity: 0.42,
    horizonBlend: 0.1,
  };
}

export type SiMapDaylightLightSpec = {
  direction: SiMapSunDirection;
  position: [number, number, number];
  color: string;
  intensity: number;
  ambientColor: string;
  ambientIntensity: number;
  shadowIntensity: number;
  castShadows: boolean;
};

export function siMapDaylightLightSpec(
  settings: SiMapWeatherSettings,
  mapCenter?: { lng: number; lat: number } | null,
): SiMapDaylightLightSpec | null {
  if (!settings.sunPositionByDateTime) return null;
  const lat = mapCenter?.lat ?? 30;
  const date = sanitizeDaylightDateIso(settings.daylightDate);
  const minutes = normalizeDaylightMinutes(settings.daylightMinutes);
  const direction = computeSiMapSunDirection(minutes, date, lat);
  return {
    direction,
    position: computeSiMapSunLightPosition(minutes, date, lat),
    color: siMapDaylightLightColor(minutes),
    intensity: siMapDaylightLightIntensity(minutes),
    ambientColor: siMapDaylightAmbientColor(minutes),
    ambientIntensity: siMapDaylightAmbientLevel(minutes),
    shadowIntensity: siMapDaylightShadowIntensity(minutes),
    castShadows: settings.daylightShadows,
  };
}

type MapboxLightingMap = MapboxMap & {
  setLights?: (lights: Array<Record<string, unknown>> | null) => void;
  setLight?: (v: Record<string, unknown>) => void;
  setConfigProperty?: (importId: string, property: string, value: unknown) => void;
  triggerRepaint?: () => void;
  getStyle?: () => { name?: string; metadata?: Record<string, unknown> } | null;
};

function siMapUsesStandardStyle(map: MapboxLightingMap, basemapId?: string): boolean {
  const styleUrl =
    typeof map.getStyle === 'function'
      ? String((map.getStyle()?.name ?? '') + (basemapId ?? ''))
      : basemapId ?? '';
  return styleUrl.includes('standard') || styleUrl.includes('Standard');
}

function requestSiMapSceneRender(map: MapboxLightingMap): void {
  map.triggerRepaint?.();
}

function daylightLightApplySignature(
  spec: SiMapDaylightLightSpec | null,
  minutes: number,
  basemapId?: string,
): string {
  if (!spec) return `off:${minutes}:${basemapId ?? ''}`;
  const d = spec.direction;
  return [
    Math.round(minutes * 2) / 2,
    spec.castShadows ? '1' : '0',
    Math.round(d.azimuth * 10) / 10,
    Math.round(d.polar * 10) / 10,
    spec.color,
    Math.round(spec.intensity * 100) / 100,
    basemapId ?? '',
  ].join(':');
}

export function resetSiMapDaylightLightCache(map: MapboxMap): void {
  const mapAny = map as MapboxLightingMap;
  lastStandardPresetByMap.delete(mapAny);
  lastDaylightLightSigByMap.delete(mapAny);
  lastDaylightLightSyncMsByMap.delete(mapAny);
}

function lightTransitionProps(): Record<string, unknown> {
  return {
    'direction-transition': { duration: SI_LIGHT_TRANSITION_MS, delay: 0 },
    'color-transition': { duration: SI_LIGHT_TRANSITION_MS, delay: 0 },
    'intensity-transition': { duration: SI_LIGHT_TRANSITION_MS, delay: 0 },
  };
}

function syncSiMapDaylightTerrainLayers(map: MapboxMap, spec: SiMapDaylightLightSpec): void {
  try {
    if (map.getLayer(HILLSHADE_LAYER_ID)) {
      map.setPaintProperty(
        HILLSHADE_LAYER_ID,
        'hillshade-illumination-direction',
        spec.direction.azimuth,
      );
    }
    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setPaintProperty(
        BUILDINGS_LAYER_ID,
        'fill-extrusion-cast-shadows',
        spec.castShadows,
      );
    }
  } catch {
    /* optional layers */
  }
}

function resetSiMapDaylightTerrainLayers(map: MapboxMap): void {
  try {
    if (map.getLayer(BUILDINGS_LAYER_ID)) {
      map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-cast-shadows', false);
    }
  } catch {
    /* optional layers */
  }
}

function applySiMapStandardStyleLighting(
  map: MapboxLightingMap,
  minutes: number,
  basemapId?: string,
): void {
  if (typeof map.setConfigProperty !== 'function') return;
  if (!siMapUsesStandardStyle(map, basemapId)) return;
  const preset = siMapStandardLightPreset(minutes);
  if (lastStandardPresetByMap.get(map) === preset) return;
  try {
    map.setConfigProperty('basemap', 'lightPreset', preset);
    lastStandardPresetByMap.set(map, preset);
  } catch {
    /* not a Mapbox Standard import */
  }
}

function applySiMap3DLights(
  map: MapboxLightingMap,
  spec: SiMapDaylightLightSpec,
  opts?: { softenAmbient?: boolean },
): boolean {
  if (typeof map.setLights !== 'function') return false;

  const ambientScale = opts?.softenAmbient ? 0.5 : 1;
  const shadowBeforeLayer = map.getLayer(HILLSHADE_LAYER_ID) ? HILLSHADE_LAYER_ID : undefined;
  const directionalProps: Record<string, unknown> = {
    color: spec.color,
    intensity: spec.intensity,
    direction: [spec.direction.azimuth, spec.direction.polar],
    'cast-shadows': spec.castShadows,
    'shadow-intensity': spec.shadowIntensity,
    ...lightTransitionProps(),
  };
  if (shadowBeforeLayer) {
    directionalProps['shadow-draw-before-layer'] = shadowBeforeLayer;
  }

  map.setLights([
    {
      type: 'ambient',
      id: SI_AMBIENT_LIGHT_ID,
      properties: {
        color: spec.ambientColor,
        intensity: spec.ambientIntensity * ambientScale,
        ...lightTransitionProps(),
      },
    },
    {
      type: 'directional',
      id: SI_SUN_LIGHT_ID,
      properties: directionalProps,
    },
  ]);
  return true;
}

function applySiMapFlatLight(map: MapboxLightingMap, spec: SiMapDaylightLightSpec | null): void {
  if (typeof map.setLight !== 'function') return;

  if (!spec) {
    map.setLight({
      anchor: 'viewport',
      color: '#ffffff',
      intensity: 0.4,
      position: [1.15, 210, 30],
    });
    return;
  }

  map.setLight({
    anchor: 'map',
    color: spec.color,
    intensity: spec.intensity,
    position: spec.position,
    'cast-shadows': spec.castShadows,
  });
}

export function applySiMapDaylightLight(
  map: MapboxMap,
  settings: SiMapWeatherSettings,
  opts?: {
    mapCenter?: { lng: number; lat: number } | null;
    basemapId?: string;
    terrainElevated?: boolean;
    /** When true, skip rate-limit (e.g. one-shot user slider release). */
    force?: boolean;
  },
): void {
  const mapAny = map as MapboxLightingMap;
  const spec = siMapDaylightLightSpec(settings, opts?.mapCenter);
  const minutes = normalizeDaylightMinutes(settings.daylightMinutes);
  const isStandard = siMapUsesStandardStyle(mapAny, opts?.basemapId);
  const sig = daylightLightApplySignature(spec, minutes, opts?.basemapId);

  if (!opts?.force) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const lastMs = lastDaylightLightSyncMsByMap.get(mapAny) ?? 0;
    if (lastDaylightLightSigByMap.get(mapAny) === sig && now - lastMs < SI_DAYLIGHT_LIGHT_SYNC_MIN_MS) {
      return;
    }
    lastDaylightLightSyncMsByMap.set(mapAny, now);
  }

  if (lastDaylightLightSigByMap.get(mapAny) === sig) return;
  lastDaylightLightSigByMap.set(mapAny, sig);

  try {
    if (!spec) {
      if (typeof mapAny.setLights === 'function' && !isStandard) {
        mapAny.setLights(null);
      }
      applySiMapFlatLight(mapAny, null);
      resetSiMapDaylightTerrainLayers(map);
      removeSiMapSkyAtmosphereLayer(map);
      applySiMapStandardStyleLighting(mapAny, 720, opts?.basemapId);
      requestSiMapSceneRender(mapAny);
      return;
    }

    ensureSiMapDaylightTerrainSupport(map, { buildings: spec.castShadows });
    let pitch = 0;
    let bearing = 0;
    try {
      pitch = map.getPitch();
      bearing = map.getBearing();
    } catch {
      /* ignore */
    }
    syncSiMapSkyAtmosphereLayer(map, spec.direction, {
      pitch,
      bearing,
      cloudCoverPct: settings.cloudCover,
    });

    const used3d = applySiMap3DLights(mapAny, spec, {
      softenAmbient: Boolean(opts?.terrainElevated),
    });
    if (!used3d) applySiMapFlatLight(mapAny, spec);

    syncSiMapDaylightTerrainLayers(map, spec);

    applySiMapStandardStyleLighting(mapAny, minutes, opts?.basemapId);

    requestSiMapSceneRender(mapAny);
  } catch {
    /* custom raster styles may not support dynamic light */
  }
}

export function siMapDaylightAddDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const nd = new Date(t);
  const yy = nd.getUTCFullYear();
  const mm = String(nd.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(nd.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Time-slider play speed (ArcGIS Daylight `playSpeedMultiplier` analogue).
 * 0.35 ≈ slower sweep → ~34s for a full 24h day (smooth continuous loop).
 */
export const SI_DAYLIGHT_PLAY_SPEED_MULTIPLIER = 0.35;

/**
 * Playback speed for the daylight time animation (ArcGIS Daylight "over a day").
 * 120 sim-minutes / wall-second at multiplier 1 → ~12s for a full day.
 */
export const SI_DAYLIGHT_PLAYBACK_MINUTES_PER_SEC =
  120 * SI_DAYLIGHT_PLAY_SPEED_MULTIPLIER;

/** Sub-minute precision for rAF time playback (smoother thumb + lighting). */
export const SI_DAYLIGHT_PLAYBACK_MINUTE_PRECISION = 0.01;

/** Calendar animation: simulated days advanced per wall second (season / sun arc). */
export const SI_DAYLIGHT_DATE_DAYS_PER_SEC = 0.4 * SI_DAYLIGHT_PLAY_SPEED_MULTIPLIER;

/** Simulated days before the date play button loops back to its start date. */
export const SI_DAYLIGHT_DATE_PLAYBACK_LOOP_DAYS = 365;

/** Continuous loop: restart from 12:00 AM when the day ends; stop only via play/pause. */
export const SI_DAYLIGHT_PLAYBACK_LOOP = true;
